package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.appservice.Util;
import io.github.jython234.matrix.appservice.network.CreateRoomRequest;
import io.github.jython234.matrix.bridge.db.Room;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import net.dv8tion.jda.core.entities.TextChannel;
import org.w3c.dom.Text;

import java.io.IOException;

/**
 * This class handles operations to "connect" two different
 * rooms/channels from Matrix and Discord.
 *
 * @author jython234
 */
public class BridgingConnector {
    private MatrixDiscordBridge bridge;

    BridgingConnector(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
    }

    /**
     * Creates a new matrix room in response to an alias request. This happens
     * when a Matrix user tries to join a room with the prefix of "#!discord_", and when
     * the room doesn't exist already.
     *
     * @param alias The full Matrix room alias.
     * @param roomId The isolated room ID we use as the key in the database.
     */
    public CreateRoomRequest createNewMatrixRoom(String alias, String roomId) throws IOException {
        var request = new CreateRoomRequest();

        var room = this.bridge.getDatabase().getRoom(roomId);
        var isPrivate = (Boolean) room.getAdditionalData().get("private");
        var discordChannel = this.bridge.jda.getTextChannelById((String) room.getAdditionalData().get("channel"));

        request.name = "#" + discordChannel.getName() + " (" + discordChannel.getGuild().getName() + ") [Discord]";
        request.topic = discordChannel.getTopic();
        request.roomAliasName = Util.getLocalpart(alias);
        request.preset = isPrivate ? "private_chat" : "public_chat";
        request.visibility = isPrivate ? "private" : "public";

        return request;
    }

    /**
     * Handles inviting and joining all the bridged bot Discord users to the newly created
     * Matrix room.
     *
     * @param dbId The ID of the room in the database.
     * @param alias The full room alias.
     * @param id The matrix room ID.
     */
    public void handleNewMatrixRoomCreated(String dbId, String alias, String id, boolean manual) throws IOException{
        var room = this.bridge.getDatabase().getRoom(dbId);
        var discordChannel = this.bridge.jda.getTextChannelById((String) room.getAdditionalData().get("channel"));

        room.updateMatrixId(id); // Make sure the Matrix ID of the room is stored in the database.
        room.updateDataField("manual", manual); // If the bridge is manually bridged or not

        discordChannel.getMembers().forEach((member) -> {
            var userId = this.bridge.getUserIdForDiscordUser(member.getUser());
            var client = this.bridge.getClientManager().getClientForUser(userId);

            try {
                this.bridge.getClientManager().getBridgeClient().invite(id, userId); // Invite the user using the Appservice account
                client.joinRoom(id); // Joins the room (accepting the invite)
            } catch (MatrixNetworkException e) {
                this.bridge.getLogger().warn("Error while handling new matrix room creation!");
                this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
                e.printStackTrace();
            }
        });

        // Done! Display a message now saying the channel is bridged
        discordChannel.sendMessage("**This room is now bridged to** ***" + alias + "***").submit();
    }

    public void handleUnbridgeRoom(TextChannel channel, Room room, boolean kickAll) throws IOException, MatrixNetworkException {
        this.handleUnbridgeRoom(channel, room, kickAll, "Received request to unbridge room, unbridging room.");
    }

    public void handleUnbridgeRoom(TextChannel channel, Room room, boolean kickAll, String message) throws IOException, MatrixNetworkException {
        this.bridge.getClientManager().getBridgeClient().sendSimpleMessage(room.getMatrixId(), message);

        channel.getMembers().forEach((member) -> {
            var userId = this.bridge.getUserIdForDiscordUser(member.getUser());
            var client = this.bridge.getClientManager().getClientForUser(userId);

            try {
                client.leaveRoom(room.getMatrixId());
            } catch (MatrixNetworkException e) {
                this.bridge.getLogger().warn("Error while handling new matrix room creation!");
                this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
                e.printStackTrace();
            }
        });

        if(kickAll) {
            var result = this.bridge.getClientManager().getBridgeClient().getRoomMembers(room.getMatrixId());
            // Get a list of room members
            if(result.successful) {
                result.result.members.forEach((key, value) -> {
                    // We don't want to kick ourselves!
                    if(key.startsWith("@" + this.bridge.getAppservice().getRegistration().getSenderLocalpart())) return;

                    // Key contains the User ID
                    try {
                        this.bridge.getClientManager().getBridgeClient().kick(room.getMatrixId(), key, "This room is being unbridged!");
                    } catch (MatrixNetworkException e) {
                        this.bridge.getLogger().warn("Failed to kick user " + key + " during unbridging of room " + room.getMatrixId());
                        this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
                        e.printStackTrace();
                    }
                });
            } else {
                this.bridge.getLogger().error("Failed to get list of room members for room " + room.getMatrixId());
                this.bridge.getLogger().error("Not kicking users in room.");
            }
        }

        // Leave the room once our work is done.
        this.bridge.getClientManager().getBridgeClient().leaveRoom(room.getMatrixId());

        room.updateMatrixId("");
        room.updateDataField("manual", false);
    }
}
