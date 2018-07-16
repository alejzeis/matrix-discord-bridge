package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.appservice.event.room.message.MessageContent;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import net.dv8tion.jda.core.entities.Message;
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
class MessageHandler {
    private MatrixDiscordBridge bridge;
    private Parser parser;
    private HtmlRenderer renderer;

    MessageHandler(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
        this.parser = Parser.builder().build();
        this.renderer = HtmlRenderer.builder().build();
    }

    private MessageContent getContentMarkdownToHtml(Message message) {
        Node doc = this.parser.parse(message.getContentDisplay());
        var text = this.renderer.render(doc);

        var content = new MessageContent.FormattedTextMessageContent();
        content.body = message.getContentDisplay();
        content.format = MessageContent.FormattedTextMessageContent.FORMAT_TYPE_HTML;
        content.formattedBody = text;
        return content;
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

    void bridgeDiscordToMatrix(GuildMessageReceivedEvent event) throws IOException, MatrixNetworkException {
        //this.bridge.getLogger().info("Discord message by, " + event.getAuthor().getName() + ", in " + event.getChannel().getName() + " : " + event.getMessage().getContentRaw());
        var roomId = Util.getRoomIdForChannel(event.getChannel());

        var room = this.bridge.getDatabase().getRoom(roomId);
        var client = this.bridge.getClientManager().getClientForUser(this.bridge.getUserIdForDiscordUser(event.getAuthor()));

        if(event.getMessage().getAttachments().size() > 0) {
            event.getMessage().getAttachments().forEach((attachment) -> {
                try {
                    if(!event.getMessage().getContentDisplay().equals("")) {
                        client.sendMessage(room.getMatrixId(), getContentMarkdownToHtml(event.getMessage()));
                    }
                    client.sendMessage(room.getMatrixId(), getContentForDiscordAttachment(event.getMessage().getContentDisplay(), attachment));
                } catch (MatrixNetworkException | IOException e) {
                    this.bridge.getLogger().error("Failed to send attachment message!");
                    this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
                    e.printStackTrace();
                }
            });
        } else {
            client.sendMessage(room.getMatrixId(), getContentMarkdownToHtml(event.getMessage()));
        }
    }
}
