package io.github.jython234.matrix.bridges.discord.handler;

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
}
