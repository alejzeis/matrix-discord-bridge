package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import net.dv8tion.jda.core.MessageBuilder;
import net.dv8tion.jda.core.entities.Member;
import net.dv8tion.jda.core.entities.Message;
import net.dv8tion.jda.core.entities.TextChannel;
import net.dv8tion.jda.core.events.message.guild.GuildMessageReceivedEvent;

import java.io.IOException;

/**
 * Responsible for processing commands sent to the bot.
 *
 * @author jython234
 */
class CommandHandler {
    private MatrixDiscordBridge bridge;

    CommandHandler(MatrixDiscordBridge bridge) {
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
            this.replyToMember(event.getChannel(), event.getMember(), "My ping is " + event.getJDA().getPing() + "ms");
            return true;
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
}
