package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import net.dv8tion.jda.core.Permission;
import net.dv8tion.jda.core.entities.Game;
import net.dv8tion.jda.core.events.ReadyEvent;
import net.dv8tion.jda.core.events.message.guild.GuildMessageReceivedEvent;
import net.dv8tion.jda.core.events.user.UserTypingEvent;
import net.dv8tion.jda.core.events.user.update.UserUpdateAvatarEvent;
import net.dv8tion.jda.core.events.user.update.UserUpdateGameEvent;
import net.dv8tion.jda.core.events.user.update.UserUpdateNameEvent;
import net.dv8tion.jda.core.events.user.update.UserUpdateOnlineStatusEvent;
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

        event.getJDA().getPresence().setPresence(Game.playing("Matrix <-> Discord Bridge"), false);

        event.getJDA().getGuilds().forEach((guild -> guild.getTextChannels().forEach(textChannel -> {
            if(textChannel.getGuild().getSelfMember().hasPermission(textChannel, Permission.MESSAGE_READ)) { // Check if we have access to the channel
                this.bridge.getLogger().info("Processing sync for: #" + textChannel.getName());
                this.bridge.databaseManagement.processUserSyncForChannel(textChannel);
            }
        })));
    }

    @Override
    public void onGuildMessageReceived(GuildMessageReceivedEvent event) {
        try {
            /*if(event.getAuthor().getId().equals(this.bridge.getDiscordConfig().getDiscord().getClientId()))
                return; // We don't want echo from our own bot*/

            this.bridge.getCommandHandler().processCommand(event); // First try to process the message as a Bot command
            this.bridge.getMessageEventsHandler().bridgeDiscordToMatrix(event); // Send the message to Matrix
        } catch (MatrixNetworkException | IOException e) {
            this.bridge.getLogger().error("Error while processing message event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onUserTyping(UserTypingEvent event) {
        try {
            this.bridge.getUserEventsHandler().handleDiscordUserTyping(event);
        } catch (MatrixNetworkException | IOException e) {
            this.bridge.getLogger().error("Error while processing typing event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onUserUpdateName(UserUpdateNameEvent event) {
        try {
            this.bridge.getUserEventsHandler().handleDiscordUserNameChange(event);
        } catch (MatrixNetworkException | IOException e) {
            this.bridge.getLogger().error("Error while processing username change event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onUserUpdateAvatar(UserUpdateAvatarEvent event) {
        try {
            this.bridge.getUserEventsHandler().handleDiscordAvatarChange(event);
        } catch (MatrixNetworkException | IOException e) {
            this.bridge.getLogger().error("Error while processing avatar change event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onUserUpdateOnlineStatus(UserUpdateOnlineStatusEvent event) {
        var id = this.bridge.getUserIdForDiscordUser(event.getUser());
        if(!this.bridge.getDatabase().userExists(id)) return; // If the user isn't in the database, they aren't on Matrix

        try {
            this.bridge.getPresenceHandler().setPresenceForUserFromDiscord(event.getMember(), this.bridge.getClientManager().getClientForUser(id));
        } catch (MatrixNetworkException e) {
            this.bridge.getLogger().error("Error while processing UserUpdateOnlineStatus event from Discord");
            this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onUserUpdateGame(UserUpdateGameEvent event) {
        var id = this.bridge.getUserIdForDiscordUser(event.getUser());
        if(!this.bridge.getDatabase().userExists(id)) return; // If the user isn't in the database, they aren't on Matrix

        try {
            this.bridge.getPresenceHandler().setPresenceForUserFromDiscord(event.getMember(), this.bridge.getClientManager().getClientForUser(id));
        } catch (MatrixNetworkException e) {
            this.bridge.getLogger().error("Error while processing UserUpdateOnlineStatus event from Discord");
            this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
