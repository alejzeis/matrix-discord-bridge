package io.github.jython234.matrix.bridges.discord.handler;

import io.github.jython234.matrix.appservice.event.presence.Presence;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridge.network.MatrixUserClient;
import io.github.jython234.matrix.bridges.discord.MatrixDiscordBridge;
import net.dv8tion.jda.core.entities.Member;

/**
 * Handles updating presences on matrix based on the user's presence on Discord.
 *
 * @author jython234
 */
public class PresenceHandler {
    //TODO: Once matrix presences update this needs an overhaul to be less hacky

    private MatrixDiscordBridge bridge;
    private boolean running = false;
    private Thread thread;

    public PresenceHandler(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
        this.thread = new Thread(this::updatePresencesLoop);
        this.thread.setName("PresenceUpdaterThread");
    }

    public void startUpdating() {
        if(running) return;
        running = true;
        this.thread.start();
    }

    public void stopUpdating() {
        if(!running) return;
        running = false;
        this.thread.interrupt();
    }

    public void updatePresencesLoop() {
        this.bridge.getLogger().info("Discord Presence Updating started.");
        while(this.running) {
            this.bridge.getJDA().getGuilds().forEach((guild) -> guild.getMembers().forEach((member) -> {
                var userId = this.bridge.getUserIdForDiscordUser(member.getUser());
                if(this.bridge.getDatabase().userExists(userId)) { // Check if they're in the database, because if they're not they haven't been registered on Matrix
                    try {
                        this.setPresenceForUserFromDiscord(member, this.bridge.getClientManager().getClientForUser(userId));
                    } catch (MatrixNetworkException e) {
                        this.bridge.getLogger().warn("Failed to set presence for user: " + member.getUser().getName());
                        this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
                        e.printStackTrace();
                    }
                }
            }));

            try {
                Thread.sleep(50000); // Run again in 50 seconds
            } catch (InterruptedException e) {
                // Interrupted, that means the thread has stopped.
            }
        }

        this.bridge.getLogger().info("Discord Presence Updating stopped.");
    }

    public void setPresenceForUserFromDiscord(Member member, MatrixUserClient client) throws MatrixNetworkException {
        var discordStatus = member.getOnlineStatus();
        var game = member.getGame();
        Presence matrixPresence;
        var statusMsgBuilder = new StringBuilder();

        switch (discordStatus) {
            case DO_NOT_DISTURB:
                statusMsgBuilder.append("Do Not Disturb");
            case ONLINE:
                matrixPresence = Presence.ONLINE;
                break;
            case IDLE:
                statusMsgBuilder.append("Idling");
                matrixPresence = Presence.UNAVAILABLE;
                break;
            case OFFLINE:
            case INVISIBLE:
            case UNKNOWN:
            default:
                matrixPresence = Presence.OFFLINE;
                break;
        }

        if(game != null) {
            var gameMsgBuilder = new StringBuilder();
            switch (game.getType()) {
                case DEFAULT:
                    gameMsgBuilder.append("Playing ").append(game.getName());
                    break;
                case WATCHING:
                    gameMsgBuilder.append("Watching ").append(game.getName());
                    break;
                case LISTENING:
                    gameMsgBuilder.append("Listening to ").append(game.getName());
                    break;
                case STREAMING:
                    gameMsgBuilder.append("Streaming ").append(game.getName()).append(" at ").append(game.getUrl());
                    break;
            }

            if(statusMsgBuilder.toString().equals("") && !gameMsgBuilder.toString().equals("")) {
                statusMsgBuilder.append(gameMsgBuilder.toString());
            } else if(!statusMsgBuilder.toString().equals("") && !gameMsgBuilder.toString().equals("")) {
                statusMsgBuilder.append(" | ").append(gameMsgBuilder.toString()); // Add separator if the status message already contains something
            }
        }

        client.setPresence(matrixPresence, statusMsgBuilder.toString());
    }
}
