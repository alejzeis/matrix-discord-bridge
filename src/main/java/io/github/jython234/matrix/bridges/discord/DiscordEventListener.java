package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import net.dv8tion.jda.core.Permission;
import net.dv8tion.jda.core.entities.Game;
import net.dv8tion.jda.core.events.ReadyEvent;
import net.dv8tion.jda.core.events.channel.text.TextChannelCreateEvent;
import net.dv8tion.jda.core.events.channel.text.TextChannelDeleteEvent;
import net.dv8tion.jda.core.events.channel.text.update.TextChannelUpdateNameEvent;
import net.dv8tion.jda.core.events.channel.text.update.TextChannelUpdateTopicEvent;
import net.dv8tion.jda.core.events.emote.EmoteAddedEvent;
import net.dv8tion.jda.core.events.emote.EmoteRemovedEvent;
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
        this.bridge.getLogger().info("Processing inital sync for all channels and members... (this may take a while!)");

        var start = System.currentTimeMillis();

        event.getJDA().getPresence().setPresence(Game.playing("Matrix <-> Discord Bridge"), false);

        event.getJDA().getGuilds().forEach((guild -> guild.getTextChannels().forEach(textChannel -> {
            if(textChannel.getGuild().getSelfMember().hasPermission(textChannel, Permission.MESSAGE_READ)) { // Check if we have access to the channel
                this.bridge.getLogger().info("Processing sync for: #" + textChannel.getName());
                this.bridge.databaseManagement.processUserSyncForChannel(textChannel);
            }
        })));

        var end = System.currentTimeMillis();
        this.bridge.getLogger().info("Initial Sync complete in " + (end - start) / 1000 + " seconds.");

        this.bridge.getEmojiManager().syncEmojis(event.getJDA());
    }

    // Emotes --------------------------------------------------------

    @Override
    public void onEmoteAdded(EmoteAddedEvent event) {
        this.bridge.getEmojiManager().syncEmoji(event.getEmote());
    }

    @Override
    public void onEmoteRemoved(EmoteRemovedEvent event) {
        try {
            this.bridge.getEmojiManager().deleteEmoji(event.getEmote());
        } catch (IOException e) {
            this.bridge.getLogger().error("Error while processing emote deletion event from Discord");
            this.bridge.getLogger().error("IOException: " + e.getMessage());
            e.printStackTrace();
        }
    }

    // Messages ------------------------------------------------------

    @Override
    public void onGuildMessageReceived(GuildMessageReceivedEvent event) {
        try {
            /*if(event.getAuthor().getId().equals(this.bridge.getDiscordConfig().getDiscord().getClientId()))
                return; // We don't want echo from our own bot*/

            this.bridge.getMessageEventsHandler().bridgeDiscordToMatrix(event); // Send the message to Matrix
            this.bridge.getCommandHandler().processCommand(event); // try to process the message as a Bot command
        } catch (MatrixNetworkException | IOException e) {
            this.bridge.getLogger().error("Error while processing message event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    // User ----------------------------------------------------------

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

    // Channels -------------------------------------------------------------------------------


    @Override
    public void onTextChannelCreate(TextChannelCreateEvent event) {
        this.bridge.getLogger().info("New channel #" + event.getChannel().getName() + " (" + event.getGuild().getName() + ") created, updating database....");

        if(event.getGuild().getSelfMember().hasPermission(event.getChannel(), Permission.MESSAGE_READ)) { // Check if we have access to the channel
            this.bridge.getDbManagement().processUserSyncForChannel(event.getChannel());
            this.bridge.getLogger().info("Done.");

            event.getChannel().sendMessage("**You can join this room on Matrix at** ***#!discord_" + Util.getRoomIdForChannel(event.getChannel()) + ":" + this.bridge.getConfig().getMatrixDomain() + "***").submit();
        } else {
            this.bridge.getLogger().info("No MESSAGE_READ permission in room, excluding from database.");
        }
    }

    @Override
    public void onTextChannelDelete(TextChannelDeleteEvent event) {
        this.bridge.getLogger().info("Channel #" + event.getChannel().getName() + " (" + event.getGuild().getName() + ") deleted, updating database...");

        try {
            this.bridge.getDbManagement().processChannelDeletion(event.getChannel());
            this.bridge.getLogger().info("Done.");
        } catch (IOException | MatrixNetworkException e) {
            this.bridge.getLogger().error("Error while processing channel deletion event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onTextChannelUpdateName(TextChannelUpdateNameEvent event) {
        this.bridge.getLogger().info("Channel #" + event.getOldName() + "(" + event.getGuild().getName() + ") changed name to #" + event.getNewName() + ", updating database..,");

        try {
            this.bridge.getDbManagement().processChannelNameChange(event.getChannel(), event.getOldName());
        } catch (IOException | MatrixNetworkException e) {
            this.bridge.getLogger().error("Error while processing channel topic change event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onTextChannelUpdateTopic(TextChannelUpdateTopicEvent event) {
        this.bridge.getLogger().info("Channel #" + event.getChannel().getName() + "(" + event.getGuild().getName() + ") changed topic.");

        try {
            this.bridge.getConnector().handleRoomTopicChange(event.getChannel());
        } catch (IOException | MatrixNetworkException e) {
            this.bridge.getLogger().error("Error while processing channel topic change event from Discord");
            this.bridge.getLogger().error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }
}
