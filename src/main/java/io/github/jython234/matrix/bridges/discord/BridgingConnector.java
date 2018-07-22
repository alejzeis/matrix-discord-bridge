package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.appservice.Util;
import io.github.jython234.matrix.appservice.network.CreateRoomRequest;
import io.github.jython234.matrix.bridge.db.Room;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridge.network.room.PowerLevelsData;
import net.dv8tion.jda.core.Permission;
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

    public PowerLevelsData getDefaultPowerLevels() {
        // Set the Matrix room power levels now.
        var powerLevels = new PowerLevelsData();
        powerLevels.ban = 50;
        powerLevels.kick = 50;
        powerLevels.invite = 0;
        powerLevels.sendMessages = 0;
        powerLevels.redactOthers = 50;
        powerLevels.events.put("m.room.name", 100);
        powerLevels.events.put("m.room.topic", 100);
        powerLevels.events.put("m.room.canonical_alias", 100);
        powerLevels.events.put("m.room.power_levels", 75);
        powerLevels.events.put("m.room.join_rules", 75);

        // Make sure we keep our power level!
        powerLevels.users.put("@" + this.bridge.getAppservice().getRegistration().getSenderLocalpart() + ":" + this.bridge.getConfig().getMatrixDomain(), 100);

        return powerLevels;
    }

    public PowerLevelsData appendLevelsForMembers(PowerLevelsData powerLevels, TextChannel channel) {
        channel.getMembers().forEach(member -> {
            var userId = this.bridge.getUserIdForDiscordUser(member.getUser());

            member.getRoles().forEach(role -> {
                if (role.getName().equals(this.bridge.getDiscordConfig().getMatrixModRole())) {
                    powerLevels.users.put(userId, 50);
                }
                if (role.getName().equals(this.bridge.getDiscordConfig().getMatrixAdminRole())) {
                    powerLevels.users.put(userId, 75);
                }
            });

            if (member.hasPermission(Permission.ADMINISTRATOR)) {
                powerLevels.users.put(userId, 75);
            }
        });

        return powerLevels;
    }

    /**
     * Handles inviting and joining all the bridged bot Discord users to the newly created
     * Matrix room.
     *
     * @param dbId The ID of the room in the database.
     * @param alias The full room alias.
     * @param id The matrix room ID.
     */
    public void handleNewMatrixRoomCreated(String dbId, String alias, String id, boolean manual) throws IOException, MatrixNetworkException {
        var room = this.bridge.getDatabase().getRoom(dbId);
        var discordChannel = this.bridge.jda.getTextChannelById((String) room.getAdditionalData().get("channel"));

        room.updateMatrixId(id); // Make sure the Matrix ID of the room is stored in the database.
        room.updateDataField("manual", manual); // If the bridge is manually bridged or not

        var powerLevels = this.getDefaultPowerLevels();

        this.appendLevelsForMembers(powerLevels, discordChannel);

        discordChannel.getMembers().forEach(member -> {
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

        if(!manual) // Only set power levels if we control the room, i.e not manually bridged
            this.bridge.getClientManager().getBridgeClient().setRoomPowerLevels(room.getMatrixId(), powerLevels);

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

    public void handleRoomTopicChange(TextChannel channel) throws IOException, MatrixNetworkException {
        var roomId = io.github.jython234.matrix.bridges.discord.Util.getRoomIdForChannel(channel);
        var room = this.bridge.getDatabase().getRoom(roomId);

        // We want to check if it's in the database, check if it's bridged, and finally if it's manually bridged
        // we don't want to change the topic in a manually bridged room, as that's already set and we probably don't have permission
        if(room != null && !room.getMatrixId().equals("") && !((Boolean) room.getAdditionalData().get("manual"))) { // If it's not in the database it's not bridged
            this.bridge.getClientManager().getBridgeClient().setRoomTopic(room.getMatrixId(), channel.getTopic());
        }
    }

    public void handleRoomNameChange(TextChannel channel) throws IOException, MatrixNetworkException {
        var roomId = io.github.jython234.matrix.bridges.discord.Util.getRoomIdForChannel(channel);
        var room = this.bridge.getDatabase().getRoom(roomId);

        // We want to check if it's in the database, check if it's bridged, and finally if it's manually bridged
        // we don't want to change the topic in a manually bridged room, as that's already set and we probably don't have permission
        if(room != null && !room.getMatrixId().equals("") && !((Boolean) room.getAdditionalData().get("manual"))) { // If it's not in the database it's not bridged

            // Create a new room alias with the new name and set it as the main alias
            this.bridge.getClientManager().getBridgeClient().createRoomAlias("#!discord_" + roomId + ":" + this.bridge.getConfig().getMatrixDomain(), room.getMatrixId());
            this.bridge.getClientManager().getBridgeClient().setRoomCanonicalAlias("#!discord_" + roomId + ":" + this.bridge.getConfig().getMatrixDomain(), room.getMatrixId());

            this.bridge.getClientManager().getBridgeClient().setRoomName(room.getMatrixId(), "#" + channel.getName() + " (" + channel.getGuild().getName() + ") [Discord]");
        }
    }
}
