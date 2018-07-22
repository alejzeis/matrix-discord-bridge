package io.github.jython234.matrix.bridges.discord.handler;

import io.github.jython234.matrix.appservice.event.room.message.MessageContent;
import io.github.jython234.matrix.appservice.event.room.message.MessageMatrixEvent;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridges.discord.MatrixDiscordBridge;
import io.github.jython234.matrix.bridges.discord.Util;
import net.dv8tion.jda.core.entities.*;
import net.dv8tion.jda.core.events.message.guild.GuildMessageReceivedEvent;
import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;

import javax.sound.sampled.UnsupportedAudioFileException;
import java.io.File;
import java.io.IOException;
import java.net.URLConnection;

/**
 * This class handles bridging messages between Matrix and Discord.
 *
 * @author jython234
 */
public class MessageEventsHandler {
    private MatrixDiscordBridge bridge;
    private Parser parser;
    private HtmlRenderer renderer;

    public MessageEventsHandler(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
        this.parser = Parser.builder().build();
        this.renderer = HtmlRenderer.builder().build();
    }

    private MessageContent getContentMarkdownToHtml(Message message) throws IOException {
        var inputText = message.getContentRaw();
        var hasMentions = false;
        var hasEmotes = false;

        // First determine if the message has mentions or emotes

        for(Member member : message.getMentionedMembers()) {
            hasMentions = true;
            inputText = inputText.replaceAll("<@!"+member.getUser().getId()+">", "@" + member.getEffectiveName());
        }

        for(Emote emote : message.getEmotes()) {
            hasEmotes = true;
            inputText = inputText.replaceAll("<:" + emote.getName() + ":" + emote.getId() + ">", ":" + emote.getName() + ":");
        }

        if(hasMentions || hasEmotes || message.getContentDisplay().contains("*") || message.getContentDisplay().contains("_") || message.getContentDisplay().contains("~")) {
            Node doc = this.parser.parse(inputText);
            var text = this.renderer.render(doc);

            var content = new MessageContent.FormattedTextMessageContent();
            content.body = inputText;
            content.format = MessageContent.FormattedTextMessageContent.FORMAT_TYPE_HTML;
            content.formattedBody = text.trim().replaceAll("\n", "<br>");

            for(Member member : message.getMentionedMembers()) {
                var userId = "@!discord_" + member.getUser().getId() + ":" + this.bridge.getConfig().getMatrixDomain();
                content.formattedBody = content.formattedBody.replaceAll("@"+member.getEffectiveName(), "<a href=\"https://matrix.to/#/" + userId + "\">" + member.getEffectiveName() + "</a>");
            }

            for(Emote emote : message.getEmotes()) {
                var mxcEmojiUrl = this.bridge.getEmojiManager().getMXCEmoji(emote);
                content.formattedBody = content.formattedBody.replaceAll(":" + emote.getName() + ":", "<img src=\"" + mxcEmojiUrl + "\" alt=\":" + emote.getName() + ":\"/>");
            }
            return content;
        } else {
            // There aren't any markdown characters, emotes, or mentions so we can send a plain message
            var content = new MessageContent.TextMessageContent();

            content.body = message.getContentDisplay();
            return content;
        }
    }

    private MessageContent getContentForDiscordAttachment(String body, Message.Attachment attachment) throws IOException, MatrixNetworkException {
        var mimetype = URLConnection.guessContentTypeFromStream(attachment.getInputStream());
        if(mimetype == null) {
            mimetype = URLConnection.guessContentTypeFromName(attachment.getFileName());
        }
        var downloadedFile = new File(this.bridge.getTmpDir().getPath() + File.separator + attachment.getFileName());
        attachment.download(downloadedFile); // Download the attachment to the tmp dir.

        var mxcURL = this.bridge.getClientManager().uploadMatrixFromFile(downloadedFile.getPath()); // Upload to Matrix

        MessageContent returnContent;
        if(attachment.isImage() && mimetype.startsWith("image")) {
            var content = new MessageContent.ImageMessageContent();
            content.info = new MessageContent.ImageMessageContent.Info();
            content.body = attachment.getFileName();

            content.info.mimetype = mimetype;
            content.info.width = attachment.getWidth();
            content.info.height = attachment.getHeight();
            content.info.size = attachment.getSize();

            content.url = mxcURL;
            
            returnContent = content;
        } else {
            // It's either audio, video, or a file
            if(mimetype.startsWith("audio")) {
                var content = new MessageContent.AudioMessageContent();
                content.info = new MessageContent.AudioMessageContent.Info();
                content.body = attachment.getFileName();
                content.url = mxcURL;

                try {
                    content.info.duration = Util.getAudioFileDuration(downloadedFile);
                } catch (UnsupportedAudioFileException e) {
                    // File type is unsupported, oh well, we'll just leave the duration blank then.
                }

                content.info.mimetype = mimetype;
                content.info.size = attachment.getSize();
                
                returnContent = content;
            } else if(mimetype.startsWith("video")) {
                var content = new MessageContent.VideoMessageContent();
                content.info = new MessageContent.VideoMessageContent.Info();
                content.body = attachment.getFileName();
                content.url = mxcURL;

                content.info.width = attachment.getWidth();
                content.info.height = attachment.getHeight();
                content.info.size = attachment.getSize();
                content.info.mimetype = mimetype;

                returnContent = content;
            } else {
                var content = new MessageContent.FileMessageContent();
                content.info = new MessageContent.FileMessageContent.Info();
                content.body = attachment.getFileName();

                content.info.mimetype = mimetype;
                content.info.size = attachment.getSize();
                content.filename = attachment.getFileName();
                content.url = mxcURL;

                returnContent = content;
            }
        }

        downloadedFile.delete(); // Delete the temporary downloaded file, as we don't need it anymore
        
        return returnContent;
    }

    private void sendMatrixMessageViaWebhook(MessageMatrixEvent event, Webhook webhook) throws MatrixNetworkException {
        var client = webhook.newClient().build();

        // Replace any custom emotes in the message
        for(var emote : webhook.getChannel().getGuild().getEmotes()) {
            event.content.body = event.content.body.replaceAll(":" + emote.getName() + ":", "<:" + emote.getName() + ":" + emote.getId() + ">");
        }

        if(event.content instanceof MessageContent.TextMessageContent || event.content instanceof MessageContent.NoticeMessageContent) {
            client.send(event.content.body);
        } else if(event.content instanceof MessageContent.EmoteMessageContent) {
            client.send("* *" + event.content.body + "*");
        } else if(event.content instanceof MessageContent.ImageMessageContent) {
            var content = (MessageContent.ImageMessageContent) event.content;

            var file = new File(this.bridge.getTmpDir() + File.separator + content.body);
            this.bridge.getClientManager().downloadMatrixFile(content.url, file.getPath());

            client.send(file);

            file.delete();
        } else if(event.content instanceof MessageContent.VideoMessageContent) {
            var content = (MessageContent.VideoMessageContent) event.content;
            if(content.info.size >= (8 * 1024 * 1024)) { // If greater than 8MB then just send download link
                client.send("**Large Video:** " + this.bridge.getConfig().getPublicServerURL() + "/_matrix/media/v1/download/" + content.url.replaceAll("mxc://", ""));
            } else {
                var file = new File(this.bridge.getTmpDir() + File.separator + content.body);
                this.bridge.getClientManager().downloadMatrixFile(content.url, file.getPath());

                client.send(file);

                file.delete();
            }
        } else if(event.content instanceof MessageContent.FileMessageContent) {
            var content = (MessageContent.FileMessageContent) event.content;
            if(content.info.size >= (8 * 1024 * 1024)) { // If greater than 8MB then just send download link
                client.send("**Large File**: " + this.bridge.getConfig().getPublicServerURL() + "/_matrix/media/v1/download/" + content.url.replaceAll("mxc://", ""));
            } else {
                var file = new File(this.bridge.getTmpDir() + File.separator + content.body);
                this.bridge.getClientManager().downloadMatrixFile(content.url, file.getPath());

                client.send(file);

                file.delete();
            }
        } else if(event.content instanceof MessageContent.AudioMessageContent) {
            var content = (MessageContent.AudioMessageContent) event.content;
            if(content.info.size >= (8 * 1024 * 1024)) { // If greater than 8MB then just send download link
                client.send("**Large Audio File:** " + this.bridge.getConfig().getPublicServerURL() + "/_matrix/media/v1/download/" + content.url.replaceAll("mxc://", ""));
            } else {
                var file = new File(this.bridge.getTmpDir() + File.separator + content.body);
                this.bridge.getClientManager().downloadMatrixFile(content.url, file.getPath());

                client.send(file);

                file.delete();
            }
        } else {
            client.send("**" + event.content.msgtype + "**: " + event.content.body);
        }

        client.close();
    }

    public void bridgeDiscordToMatrix(GuildMessageReceivedEvent event) throws IOException, MatrixNetworkException {
        //this.bridge.getLogger().info("Discord message by, " + event.getAuthor().getName() + ", in " + event.getChannel().getName() + " : " + event.getMessage().getContentRaw());
        var roomId = Util.getRoomIdForChannel(event.getChannel());

        var room = this.bridge.getDatabase().getRoom(roomId);
        var client = this.bridge.getClientManager().getClientForUser(this.bridge.getUserIdForDiscordUser(event.getAuthor()));

        client.setTyping(room.getMatrixId(), false); // We're sending a message finally so we aren't typing anymore if we were before

        if(event.getMessage().getAttachments().size() > 0) {
            event.getMessage().getAttachments().forEach((attachment) -> {
                try {
                    // Send the message caption if there is one
                    if(!event.getMessage().getContentDisplay().equals("")) {
                        client.sendMessage(room.getMatrixId(), getContentMarkdownToHtml(event.getMessage()));
                    }

                    // Now send the actual attachment
                    client.sendMessage(room.getMatrixId(), getContentForDiscordAttachment(event.getMessage().getContentDisplay(), attachment));
                } catch (MatrixNetworkException | IOException e) {
                    this.bridge.getLogger().error("Failed to send attachment message!");
                    this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
                    e.printStackTrace();
                }
            });
        } else {
            // No attachments or anything, just a plain old text message
            client.sendMessage(room.getMatrixId(), getContentMarkdownToHtml(event.getMessage()));
        }
    }

    public void bridgeMatrixToDiscord(MessageMatrixEvent event) throws IOException {
        //this.bridge.getLogger().info("Matrix message from " + event.sender + ", : " + event.content.body);

        var room = this.bridge.getDatabase().getRoomByMatrixId(event.roomId);
        var channelId = (String) room.getAdditionalData().get("channel");
        var channel = this.bridge.getJDA().getTextChannelById(channelId);

        var hookId = (String) room.getAdditionalData().get("webhook-" + event.sender);

        if(hookId != null) {
            var webhook = this.bridge.getWebhookManager().getWebhookById(channel, hookId);
            if(webhook != null) {
                try {
                    this.sendMatrixMessageViaWebhook(event, webhook);
                } catch (MatrixNetworkException e) {
                    this.bridge.getLogger().warn("Failed to bridge message to discord!");
                    this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
                    e.printStackTrace();
                }
            }
        } else {
            try {
                // Create the webhook
                var webhook = this.bridge.getWebhookManager().createWebhookForUser(channel, event.sender);

                // Store the ID for future messages
                room.updateDataField("webhook-" + event.sender, webhook.getId());

                // Send the message
                this.sendMatrixMessageViaWebhook(event, webhook);
            } catch (MatrixNetworkException e) {
                this.bridge.getLogger().warn("Failed to bridge message to discord!");
                this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
                e.printStackTrace();
            }
        }
    }
}
