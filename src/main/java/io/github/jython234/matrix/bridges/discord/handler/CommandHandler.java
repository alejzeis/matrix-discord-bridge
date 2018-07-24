package io.github.jython234.matrix.bridges.discord.handler;

import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridges.discord.MatrixDiscordBridge;
import io.github.jython234.matrix.bridges.discord.Util;
import net.dv8tion.jda.core.MessageBuilder;
import net.dv8tion.jda.core.Permission;
import net.dv8tion.jda.core.entities.Member;
import net.dv8tion.jda.core.entities.Message;
import net.dv8tion.jda.core.entities.Role;
import net.dv8tion.jda.core.entities.TextChannel;
import net.dv8tion.jda.core.events.message.guild.GuildMessageReceivedEvent;

import java.io.IOException;

/**
 * Responsible for processing commands sent to the bot.
 *
 * @author jython234
 */
public class CommandHandler {
    private MatrixDiscordBridge bridge;

    public CommandHandler(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
    }

    private void replyToMember(TextChannel channel, Member member, String message) {
        MessageBuilder builder = new MessageBuilder();
        builder.append(member);
        builder.append(", ");
        builder.append(message);

        channel.sendMessage(builder.build()).submit();
    }

    public boolean processCommand(GuildMessageReceivedEvent event) {
        if(event.getAuthor().isBot()) return false;

        var content = event.getMessage().getContentDisplay();
        if(content.startsWith("$invite")) {
            // This person wants to invite someone
            try {
                this.handleInviteCommand(event.getChannel(), event.getMessage(), event.getMember());
            } catch (IOException | MatrixNetworkException e) {
                this.replyToMember(event.getChannel(), event.getMember(), "There was an error while processing that command!");

                this.bridge.getLogger().warn("Error while processing invite command.");
                this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
                e.printStackTrace();
            } finally {
                return true;
            }
        } else if(content.startsWith("$ping")) {
            this.replyToMember(event.getChannel(), event.getMember(), "PONG! My ping is " + event.getJDA().getPing() + "ms!");
            return true;
        } else if(content.startsWith("$mod")) {
            try {
                this.handleModCommand(event.getChannel(), event.getMessage(), event.getMember());
            } catch (IOException | MatrixNetworkException e) {
                this.replyToMember(event.getChannel(), event.getMember(), "There was an error while processing that command!");

                this.bridge.getLogger().warn("Error while processing $mod command.");
                this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
                e.printStackTrace();
            } finally {
                return true;
            }
        } else if(content.startsWith("$admin")) {
            try {
                this.handleAdminCommand(event.getChannel(), event.getMessage(), event.getMember());
            } catch (IOException | MatrixNetworkException e) {
                this.replyToMember(event.getChannel(), event.getMember(), "There was an error while processing that command!");

                this.bridge.getLogger().warn("Error while processing $admin command.");
                this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
                e.printStackTrace();
            } finally {
                return true;
            }
        } else if(content.startsWith("$info")) {
            this.replyToMember(event.getChannel(), event.getMember(), "I'm running " + MatrixDiscordBridge.SOFTWARE + " v" + MatrixDiscordBridge.SOFTWARE_VERSION
                    + "\nSystem:       " + System.getProperty("os.name") + " " + System.getProperty("os.version") + " " + System.getProperty("os.arch")
                    + "\nJRE:          " + System.getProperty("java.version") + " by " + System.getProperty("java.vendor")
                    + "\nRAM Free:     " + (Runtime.getRuntime().freeMemory() / 1048576) + "MB out of " + (Runtime.getRuntime().totalMemory() / 1048576) + "MB"
                    + "\nMax RAM:      " + (Runtime.getRuntime().maxMemory() / 1048576) + "MB"
                    + "\nDiscord Ping: " + event.getJDA().getPing() + "ms"
                );
            return true;
        } else if(content.startsWith("$bridge")) {
            // This person wants to custom bridge a room.
            try {
                this.handleBridgeCommand(event.getChannel(), event.getMessage(), event.getMember());
            } catch (IOException | MatrixNetworkException e) {
                this.replyToMember(event.getChannel(), event.getMember(), "There was an error while processing that command!");

                this.bridge.getLogger().warn("Error while processing bridge command.");
                this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
                e.printStackTrace();
            } finally {
                return true;
            }
        } else if(content.startsWith("$unbridge")) {
            try {
                this.handleUnbridgeCommand(event.getChannel(), event.getMessage(), event.getMember());
            } catch (IOException | MatrixNetworkException e) {
                this.replyToMember(event.getChannel(), event.getMember(), "There was an error while processing that command!");

                this.bridge.getLogger().warn("Error while processing unbridge command.");
                this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
                e.printStackTrace();
            } finally {
                return true;
            }
        } else {
            return false;
        }
    }

    private void handleInviteCommand(TextChannel channel, Message message, Member member) throws IOException, MatrixNetworkException {
        var split = message.getContentDisplay().trim().split("\\s+");
        if(split.length != 2) { // Make sure it is correctly formatted
            this.replyToMember(channel, member, "Correct usage: **$invite [userId]**");
            return;
        }
        var userId = split[1];

        if(!member.hasPermission(Permission.CREATE_INSTANT_INVITE)) {
            this.replyToMember(channel, member, "You don't have permissions to invite someone, you need to have the **CREATE_INSTANT_INVITE** permission.");
            return;
        }

        // Get the room
        var roomId = Util.getRoomIdForChannel(channel);
        var room = this.bridge.getDatabase().getRoom(roomId);
        if(room == null || room.getMatrixId() == null || room.getMatrixId().equals("")) {
            this.replyToMember(channel, member, "This channel appears to not be bridged.");
            return;
        }

        this.bridge.getClientManager().getBridgeClient().invite(room.getMatrixId(), userId);
        this.replyToMember(channel, member, "**Successfully invited** *" + userId +"* **to this room on Matrix.**");
    }

    private void handleModCommand(TextChannel channel, Message message, Member member) throws IOException, MatrixNetworkException {
        var split = message.getContentDisplay().trim().split("\\s+");
        if(split.length != 2) { // Make sure it is correctly formatted
            this.replyToMember(channel, member, "Correct usage: **$mod [userId]**");
            return;
        }
        var userId = split[1];

        // Get the room
        var roomId = Util.getRoomIdForChannel(channel);
        var room = this.bridge.getDatabase().getRoom(roomId);
        if(room == null) {
            this.replyToMember(channel, member, "I couldn't find this channel in my database, something is wrong!");
            return;
        } else if(room.getMatrixId() == null || room.getMatrixId().equals("")) {
            this.replyToMember(channel, member, "This channel isn't bridged!");
            return;
        }

        for (Role role : member.getRoles()) {
            if(role.getName().equals(this.bridge.getDiscordConfig().getMatrixModRole())) {
                var defaultLevels = this.bridge.getConnector().getDefaultPowerLevels();
                this.bridge.getConnector().appendLevelsForMembers(defaultLevels, channel);

                defaultLevels.users.put(userId, 50); // 50 is moderator, 75 is admin

                this.bridge.getClientManager().getBridgeClient().setRoomPowerLevels(room.getMatrixId(), defaultLevels);

                this.replyToMember(channel, member, "Successfully made **" + userId +"** a Matrix moderator for this room.");
                return;
            }
        }

        this.replyToMember(channel, member, "You don't have permissions to make a Matrix user a moderator, you need to have the **\"" + this.bridge.getDiscordConfig().getMatrixModRole() + "\"** role.");
    }

    private void handleAdminCommand(TextChannel channel, Message message, Member member) throws IOException, MatrixNetworkException {
        var split = message.getContentDisplay().trim().split("\\s+");
        if(split.length != 2) { // Make sure it is correctly formatted
            this.replyToMember(channel, member, "Correct usage: **$admin [userId]**");
            return;
        }
        var userId = split[1];

        // Get the room
        var roomId = Util.getRoomIdForChannel(channel);
        var room = this.bridge.getDatabase().getRoom(roomId);
        if(room == null) {
            this.replyToMember(channel, member, "I couldn't find this channel in my database, something is wrong!");
            return;
        } else if(room.getMatrixId() == null || room.getMatrixId().equals("")) {
            this.replyToMember(channel, member, "This channel isn't bridged!");
            return;
        }

        for (Role role : member.getRoles()) {
            if(role.getName().equals(this.bridge.getDiscordConfig().getMatrixAdminRole())) {
                var defaultLevels = this.bridge.getConnector().getDefaultPowerLevels();
                this.bridge.getConnector().appendLevelsForMembers(defaultLevels, channel);

                defaultLevels.users.put(userId, 75); // 50 is moderator, 75 is admin

                this.bridge.getClientManager().getBridgeClient().setRoomPowerLevels(room.getMatrixId(), defaultLevels);

                this.replyToMember(channel, member, "Successfully made **" + userId +"** a Matrix admin for this room.");
                return;
            }
        }

        this.replyToMember(channel, member, "You don't have permissions to make a Matrix user an admin, you need to have the **\"" + this.bridge.getDiscordConfig().getMatrixAdminRole() + "\"** role.");
    }

    private void handleBridgeCommand(TextChannel channel, Message message, Member member) throws IOException, MatrixNetworkException {
        var split = message.getContentDisplay().trim().split("\\s+");
        if(split.length != 2) { // Make sure it is correctly formatted
            this.replyToMember(channel, member, "Correct usage: **$bridge [roomId** ***OR*** **roomAlias]**");
            return;
        }
        var roomIdOrAlias = split[1];

        if(!member.hasPermission(Permission.MANAGE_CHANNEL)) {
            this.replyToMember(channel, member, "You don't have permissions to manually bridge, you need to have the **MANAGE_CHANNEL** permission.");
            return;
        }

        // Get the actual matrix ID
        String matrixId;
        if(roomIdOrAlias.startsWith("!")) {
            matrixId = roomIdOrAlias; // Matrix room IDs start with !
        } else {
            // It's probably an alias
            var response = this.bridge.getClientManager().getBridgeClient().getRoomIdFromAlias(roomIdOrAlias);
            if(!response.successful) {
                this.replyToMember(channel, member, "That room alias doesn't exist!");
                return;
            } else {
                matrixId = response.result.roomId;
            }
        }

        // Get the room
        var roomId = Util.getRoomIdForChannel(channel);
        var room = this.bridge.getDatabase().getRoom(roomId);
        if(room == null) {
            this.replyToMember(channel, member, "I couldn't find this channel in my database, something is wrong!");
            return;
        } else if(!room.getMatrixId().equals("")) {
            this.replyToMember(channel, member, "This channel is already bridged!");
            return;
        }

        // First try to join the room
        if(!this.bridge.getClientManager().getBridgeClient().joinRoom(roomIdOrAlias).successful) {
            this.replyToMember(channel, member, "I couldn't join that matrix room, maybe it doesn't exist or I'm not invited?");
            return;
        }

        // We are in the room, now we need to add all the users and update the database
        this.bridge.getConnector().handleNewMatrixRoomCreated(roomId, roomIdOrAlias, matrixId, true);
    }

    private void handleUnbridgeCommand(TextChannel channel, Message message, Member member) throws IOException, MatrixNetworkException {
        if(!member.hasPermission(Permission.MANAGE_CHANNEL)) {
            this.replyToMember(channel, member, "You don't have permissions to manually unbridge, you need to have the **MANAGE_CHANNEL** permission.");
            return;
        }

        // Get the room
        var roomId = Util.getRoomIdForChannel(channel);
        var room = this.bridge.getDatabase().getRoom(roomId);
        if(room == null) {
            this.replyToMember(channel, member, "I couldn't find this channel in my database, something is wrong!");
            return;
        } else if(room.getMatrixId() == null || room.getMatrixId().equals("")) {
            this.replyToMember(channel, member, "This channel isn't bridged!");
            return;
        }

        if((Boolean) room.getAdditionalData().get("manual")) {
            // This is a manual bridge, so we just want to have all the bot users leave and finally the appservice bot
            this.bridge.getConnector().handleUnbridgeRoom(channel, room, false);
        } else {
            // Kick everyone and then leave
            this.bridge.getConnector().handleUnbridgeRoom(channel, room, true);
        }

        this.replyToMember(channel, member, "**Room unbridged.**");
    }
}
