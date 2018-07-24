package io.github.jython234.matrix.bridges.discord.handler;

import io.github.jython234.matrix.appservice.event.room.RoomMemberMatrixEvent;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridges.discord.MatrixDiscordBridge;
import io.github.jython234.matrix.bridges.discord.Util;
import net.dv8tion.jda.core.events.user.UserTypingEvent;
import net.dv8tion.jda.core.events.user.update.UserUpdateAvatarEvent;
import net.dv8tion.jda.core.events.user.update.UserUpdateNameEvent;

import java.io.IOException;

/**
 * Handles briding user-related events like typing or profile picture changes.
 *
 * @author jython234
 */
public class UserEventsHandler {
    private MatrixDiscordBridge bridge;

    public UserEventsHandler(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
    }

    public void handleDiscordUserTyping(UserTypingEvent event) throws IOException, MatrixNetworkException {
        var roomId = Util.getRoomIdForChannel(event.getTextChannel());
        var room = this.bridge.getDatabase().getRoom(roomId);

        var userId = this.bridge.getUserIdForDiscordUser(event.getUser());

        this.bridge.getClientManager().getClientForUser(userId).setTyping(room.getMatrixId(), true, 7000);
    }

    public void handleDiscordUserNameChange(UserUpdateNameEvent event) throws IOException, MatrixNetworkException {
        var userId = this.bridge.getUserIdForDiscordUser(event.getUser());

        if(this.bridge.getDatabase().userExists(userId)) { // If they're not in the database, they aren't on Matrix
            this.bridge.getDbManagement().updateUsernameFromDiscordUser(this.bridge.getDatabase().getUser(userId), event.getUser()
                    , this.bridge.getClientManager().getClientForUser(userId));
        }
    }

    public void handleDiscordAvatarChange(UserUpdateAvatarEvent event) throws IOException, MatrixNetworkException {
        var userId = this.bridge.getUserIdForDiscordUser(event.getUser());

        if(this.bridge.getDatabase().userExists(userId)) { // If they're not in the database, they aren't on Matrix
            this.bridge.getDbManagement().updateAvatarFromDiscordUser(this.bridge.getDatabase().getUser(userId), event.getUser()
                    , this.bridge.getClientManager().getClientForUser(userId));
        }
    }

    public void handleMatrixMembershipEvent(RoomMemberMatrixEvent event) throws IOException, MatrixNetworkException {
        var room = this.bridge.getDatabase().getRoomByMatrixId(event.roomId);
        var channel = this.bridge.getJDA().getTextChannelById((String) room.getAdditionalData().get("channel"));

        switch (event.content.membership) {
            case JOIN:
                if(!this.bridge.getWebhookManager().userHasWebhook(room, event.stateKey)) { // Check if the user had a webhook, meaning that they were already in the room before
                    // They weren't in the room before, so display a join message
                    channel.sendMessage("__**Matrix:**__ ***" + event.content.displayname + "*** (*" + event.stateKey + "*) has joined the room.").submit();
                }

                // Update the webhook for this user
                this.bridge.getWebhookManager().updateWebhookForUser(channel, room, event.stateKey, event.content.displayname, event.content.avatarURL);
                break;
            case LEAVE:
                // Remove the webhook
                this.bridge.getWebhookManager().removeWebhookForUser(channel, room, event.stateKey);

                // Send a leave message
                channel.sendMessage("__**Matrix:**__ *" + event.stateKey + "* has left the room.").submit();
                break;
            case INVITE:
                // Send an invite message
                channel.sendMessage("__**Matrix:**__ ***" + event.content.displayname + "*** (*" + event.stateKey + "*) was invited to the room by *" + event.sender + "*.").submit();
                break;
        }
    }
}
