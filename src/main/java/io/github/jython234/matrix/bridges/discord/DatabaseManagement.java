package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.bridge.db.Room;
import io.github.jython234.matrix.bridge.db.User;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridge.network.MatrixUserClient;
import net.dv8tion.jda.core.Permission;
import net.dv8tion.jda.core.entities.Member;
import net.dv8tion.jda.core.entities.TextChannel;

import java.io.IOException;

/**
 * This class handles manipulating the database based on Discord
 * and Matrix events respectively.
 *
 * @author jython234
 */
public class DatabaseManagement {
    private MatrixDiscordBridge bridge;

    DatabaseManagement(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
    }

    /**
     * Processes a "sync" for a single text channel. It updates the database, adding
     * a new Room entry for the channel if it doesn't exist, and adding new User entries
     * if a channel member doesn't exist, or updating them if they do.
     * @param channel
     */
    void processUserSyncForChannel(TextChannel channel) {
        var roomId = Util.getRoomIdForChannel(channel); // the ID of the room in the database, and also the matrix room alias

        try {
            Room room;
            if(!bridge.getDatabase().roomExists(roomId)) {
                // Room doesn't exist, we need to create a new entry then.
                room = new Room(this.bridge.getDatabase(), roomId);
                this.bridge.getDatabase().putRoom(room);

                room.updateDataField("guild", channel.getGuild().getId());
                room.updateDataField("channel", channel.getId());
                room.updateDataField("manual", false);
            } else {
                // The Room already exists in the database
                room = bridge.getDatabase().getRoom(roomId);
            }

            // Determine if the channel is private or public to @everyone.
            room.updateDataField("private", false); // Assume public unless proven otherwise below
            channel.getPermissionOverrides().forEach((permissionOverride -> {
                if(permissionOverride.isRoleOverride() && permissionOverride.getRole().isPublicRole()) { // This gets permission overrides for @everyone, if there are any
                    if(permissionOverride.getDenied().contains(Permission.MESSAGE_READ)) { // Check if @everyone has Read Messages denied
                        room.updateDataField("private", true); // @everyone has Read Messages denied so it's most likely a private room.
                    }
                }
            }));
            // The private field is used to determine if the corresponding Matrix room needs to be invite only.

            // Now we loop through all the channel members and add them to the database if they're not already in it.
            channel.getMembers().forEach(this::setupMemberInDatabase);
        } catch (IOException e) {
            this.bridge.getLogger().warn("Failed to process sync for Discord channel #" + channel.getName() + ", guild: " + channel.getGuild().getName());
            this.bridge.getLogger().error("IOException: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void setupMemberInDatabase(Member member) {
        try {
            User user;
            var client = this.bridge.getClientManager().getClientForUser(this.bridge.getUserIdForDiscordUser(member.getUser()));

            if(this.bridge.getDatabase().userExists(member.getUser().getId())) {
                // User already exists in database
                user = this.bridge.getDatabase().getUser(member.getUser().getId());
            } else {
                // User doesn't exist
                user = new User(this.bridge.getDatabase(), User.Type.REMOTE_USER, member.getUser().getId());
                this.bridge.getDatabase().putUser(user);
            }

            // Update the name and avatars
            if(user.getAdditionalData().get("name") == null
                    || !user.getAdditionalData().get("name").equals(member.getUser().getName())) {

                this.updateUsernameFromDiscordUser(user, member.getUser(), client);
            }

            if((user.getAdditionalData().get("avatar") == null
                    || !user.getAdditionalData().get("avatar").equals(member.getUser().getAvatarId()))
                    && member.getUser().getAvatarId() != null) { // Make sure to check if the avatarId is null, that means they don't have a profile picture set

                this.updateAvatarFromDiscordUser(user, member.getUser(), client);
            }
        } catch (IOException e) {
            this.bridge.getLogger().warn("Failed to setup member in database for Discord user: " + member.getUser().getName());
            this.bridge.getLogger().error("IOException: " + e.getMessage());
            e.printStackTrace();
        } catch (MatrixNetworkException e) {
            this.bridge.getLogger().warn("Failed to setup member in database for Discord user: " + member.getUser().getName());
            this.bridge.getLogger().error("MatrixNetworkException: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void updateUsernameFromDiscordUser(User user, net.dv8tion.jda.core.entities.User discordUser, MatrixUserClient client) throws MatrixNetworkException {
        user.updateDataField("name", discordUser.getName());
        client.setDisplayName((discordUser.isBot() ? "[BOT] " : "") + discordUser.getName()); // Set the matrix display name
    }

    public void updateAvatarFromDiscordUser(User user, net.dv8tion.jda.core.entities.User discordUser, MatrixUserClient client) throws IOException {
        user.updateDataField("avatar", discordUser.getAvatarId());
        this.bridge.setMatrixAvatarFromDiscord(client, discordUser); // Set the avatar on matrix
    }
}
