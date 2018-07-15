package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import net.dv8tion.jda.core.events.ReadyEvent;
import net.dv8tion.jda.core.events.message.guild.GuildMessageReceivedEvent;
import net.dv8tion.jda.core.hooks.ListenerAdapter;

import java.io.IOException;

public class DiscordEventListener extends ListenerAdapter {
    private MatrixDiscordBridge bridge;

    public DiscordEventListener(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
    }

    @Override
    public void onReady(ReadyEvent event) {
        this.bridge.getLogger().info("Discord connection ready!");
        this.bridge.getLogger().info("Processing inital sync for all channels and members...");

        event.getJDA().getGuilds().forEach((guild -> guild.getTextChannels().forEach(textChannel -> {
            if(textChannel.canTalk()) { // Check if we have access to the channel
                this.bridge.getLogger().info("Processing sync for: #" + textChannel.getName());
                this.bridge.databaseManagement.processUserSyncForChannel(textChannel);
            }
        })));
    }

    @Override
    public void onGuildMessageReceived(GuildMessageReceivedEvent event) {
        try {
            this.bridge.messageHandler.bridgeDiscordToMatrix(event);
        } catch (IOException e) {
            this.bridge.getLogger().error("Error while processing message from Discord");
            this.bridge.getLogger().error("IOException: " + e.getMessage());
            e.printStackTrace();
        } catch (MatrixNetworkException e) {
            this.bridge.getLogger().error("Error while processing message from Discord");
            this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
