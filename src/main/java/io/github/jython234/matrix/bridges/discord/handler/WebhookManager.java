package io.github.jython234.matrix.bridges.discord.handler;

import io.github.jython234.matrix.bridge.db.Room;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridges.discord.MatrixDiscordBridge;
import net.dv8tion.jda.core.entities.Icon;
import net.dv8tion.jda.core.entities.TextChannel;
import net.dv8tion.jda.core.entities.Webhook;

import java.io.File;
import java.io.IOException;

public class WebhookManager {
    private MatrixDiscordBridge bridge;

    public WebhookManager(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
    }

    Webhook createWebhookForUser(TextChannel channel, String userId) throws IOException, MatrixNetworkException {
        var senderDomain = userId.split(":")[1]; // Get the last part of the user ID, which is the domain

        // Create the new webhook
        var webhookBuilder = channel.createWebhook(userId);


        var avatar = new File(this.bridge.getTmpDir() + File.separator + System.currentTimeMillis() + ".png"); // Temporary file for downloading avatar
        var name = this.bridge.getClientManager().getBridgeClient().getDisplayName(userId); // Get the displayname of the user
        var avatarUrl = this.bridge.getClientManager().getBridgeClient().getAvatarURL(userId); // Get the avatar url of the user

        if(name.successful) {
            webhookBuilder.setName(name.result + " (" + senderDomain + ")").queue();
        } else this.bridge.getLogger().warn("Failed to lookup displayname for " + userId + " while creating webhook!");

        if(avatarUrl.successful && avatarUrl.result != null) { // Result will be null if the user doesn't have an avatar set
            this.bridge.getClientManager().downloadMatrixFile(avatarUrl.result, avatar.getPath());
            webhookBuilder.setAvatar(Icon.from(avatar)).queue();

            avatar.delete();
        } else this.bridge.getLogger().warn("Failed to lookup avatar URL for " + userId + " while creating webhook!");

        return webhookBuilder.complete();
    }

    Webhook getWebhookById(TextChannel channel, String id) {
        for(var webhook : channel.getWebhooks().complete()) {
            if(webhook.getId().equals(id)) {
                return webhook;
            }
        }

        return null;
    }

    boolean userHasWebhook(Room room, String userId) {
        return room.getAdditionalData().containsKey("webhook-" + userId);
    }

    void removeWebhookForUser(TextChannel channel, Room room, String userId) {
        var hookId = room.getAdditionalData().get("webhook-" + userId);
        if(hookId != null) {
            channel.getWebhooks().complete().forEach(webhook -> {
                if(webhook.getId().equals(hookId)) {
                    webhook.delete().queue();
                }
            });
        }

        room.deleteDataField("webhook-" + userId); // Remove the webhook Id from the database
    }

    void updateWebhookForUser(TextChannel channel, Room room, String userId, String displayname, String avatarUrl) throws MatrixNetworkException, IOException {
        var senderDomain = userId.split(":")[1]; // Get the last part of the user ID, which is the domain
        var hookId = room.getAdditionalData().get("webhook-" + userId);

        if(hookId != null) {
            for (var webhook : channel.getWebhooks().complete()) {
                var avatar = new File(this.bridge.getTmpDir() + File.separator + System.currentTimeMillis() + ".png"); // Temporary file for downloading avatar

                webhook.getManager().setName(displayname + " (" + senderDomain + ")").queue();

                if(avatarUrl != null && !avatarUrl.equals("")) { // Will be null if the user doesn't have an avatar set
                    this.bridge.getClientManager().downloadMatrixFile(avatarUrl, avatar.getPath());
                    webhook.getManager().setAvatar(Icon.from(avatar)).queue();

                    avatar.delete();
                }

                webhook.getManager().queue();
            }
        } else createWebhookForUser(channel, userId);
    }
}
