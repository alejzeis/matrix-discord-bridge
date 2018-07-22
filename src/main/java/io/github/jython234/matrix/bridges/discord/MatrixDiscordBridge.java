package io.github.jython234.matrix.bridges.discord;

import io.github.jython234.matrix.appservice.Util;
import io.github.jython234.matrix.appservice.event.room.RoomMemberMatrixEvent;
import io.github.jython234.matrix.appservice.event.room.message.MessageMatrixEvent;
import io.github.jython234.matrix.appservice.exception.KeyNotFoundException;
import io.github.jython234.matrix.appservice.network.CreateRoomRequest;
import io.github.jython234.matrix.bridge.MatrixBridge;
import io.github.jython234.matrix.bridge.MatrixEventHandler;
import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridge.network.MatrixUserClient;
import io.github.jython234.matrix.bridges.discord.config.DiscordBridgeConfig;
import io.github.jython234.matrix.bridges.discord.config.DiscordBridgeConfigLoader;
import io.github.jython234.matrix.bridges.discord.handler.*;
import net.dv8tion.jda.core.AccountType;
import net.dv8tion.jda.core.JDA;
import net.dv8tion.jda.core.JDABuilder;
import net.dv8tion.jda.core.entities.User;
import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.security.auth.login.LoginException;
import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;

/**
 * Main Class for the discord bridge. It's also the base matrix bridge
 * controller class.
 *
 * @author jython234
 */
public class MatrixDiscordBridge extends MatrixBridge {
    public static final String SOFTWARE = "matrix-discord-bridge";
    public static final String SOFTWARE_VERSION = "2.0.0-SNAPSHOT";

    public static final String USER_PREFIX ="!discord_";
    public static final String ROOM_PREFIX = "!discord_";

    public static final String DEFAULT_CONFIG_DIR = "config";
    public static final String UNIX_CONFIG_DIR = "/etc/matrix-discord-bridge";

    protected Logger logger;
    protected DatabaseManagement databaseManagement;
    protected BridgingConnector connector;

    private CommandHandler commandHandler;
    private PresenceHandler presenceHandler;
    private MessageEventsHandler messageEventsHandler;
    private UserEventsHandler userEventsHandler;
    private EmojiManager emojiManager;
    private WebhookManager webhookManager;

    protected JDA jda;

    private DiscordBridgeConfig discordConfig;
    private File tmpDir = new File(System.getProperty("java.io.tmpdir") + File.separator + "matrix-discord-bridge");

    public MatrixDiscordBridge(String configDirectory) throws IOException, KeyNotFoundException {
        super(configDirectory);
        this.logger = LoggerFactory.getLogger("MatrixDiscordBridge");

        this.databaseManagement = new DatabaseManagement(this);
        this.connector = new BridgingConnector(this);

        this.commandHandler = new CommandHandler(this);
        this.presenceHandler = new PresenceHandler(this);
        this.messageEventsHandler = new MessageEventsHandler(this);
        this.userEventsHandler = new UserEventsHandler(this);

        this.emojiManager = new EmojiManager(this);
        this.webhookManager = new WebhookManager(this);

        if(!tmpDir.exists()) {
            tmpDir.mkdirs();
        }

        this.loadDiscordConfig(configDirectory);
    }

    public static void main(String[] args) throws IOException, KeyNotFoundException {
        var cfgDir = System.getProperty("os.name").equals("linux") ? UNIX_CONFIG_DIR : DEFAULT_CONFIG_DIR;
        if(System.getenv("BRIDGE_CFG_DIR") != null || !System.getenv("BRIDGE_CFG_DIR").equals("")) {
            cfgDir = System.getenv("BRIDGE_CFG_DIR");
        }

        var bridge = new MatrixDiscordBridge(cfgDir);
        bridge.start();
    }

    private void loadDiscordConfig(String configDirectory) throws IOException, KeyNotFoundException {
        File location = new File(configDirectory + File.separator + "discord-bridge.yml");
        this.logger.info("Loading Matrix-Discord Bridge config from: " + location.toString());

        if(!location.exists()) {
            this.logger.warn("Failed to find Matrix-Discord Bridge config, copying default!");

            Util.copyResourceTo("defaultDiscordConfig.yml", location);

            this.logger.info("Default config copied, please edit the config now!");
            System.exit(1);
        }

        this.discordConfig = DiscordBridgeConfigLoader.loadFromFile(location);
    }

    @Override
    protected void onStart() {
        try {
            this.logger.info("Connecting to discord...");

            this.jda = new JDABuilder(AccountType.BOT)
                    .setToken(this.discordConfig.getDiscord().getToken())
                    .addEventListener(new DiscordEventListener(this))
                    .buildBlocking();

            this.presenceHandler.startUpdating();
        } catch (LoginException e) {
            this.logger.error("FAILED TO LOG IN TO DISCORD!");
            this.logger.error("LoginException: " + e.getMessage());
            e.printStackTrace(System.err);
            System.exit(1);
        } catch (InterruptedException e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    @Override
    protected void onStop() {
        this.presenceHandler.stopUpdating();
        this.jda.shutdown();
    }

    @Override
    protected CreateRoomRequest onRoomAliasQueried(String alias) {
        var roomId = alias.split(":")[0].split("_")[1];
        this.logger.info("Received alias query: " + alias + ", extracted roomId: " + roomId);

        if(this.getDatabase().roomExists(roomId)) {
            try {
                return this.connector.createNewMatrixRoom(alias, roomId);
            } catch (IOException e) {
                this.logger.error("Error while processing alias query!");
                this.logger.error("IOException: " + e.getMessage());
                e.printStackTrace();
                return null;
            }
        } else {
            // We don't have that room in our database, which means it doesn't exist on the discord side.
            return null;
        }
    }

    @Override
    protected void onRoomAliasCreated(String alias, String id) {
        var roomId = alias.split(":")[0].split("_")[1];
        this.logger.info("A bridged room, " + alias +", was created!");

        try {
            this.connector.handleNewMatrixRoomCreated(roomId, alias, id, false);
        } catch (MatrixNetworkException | IOException e) {
            this.logger.error("Error while processing alias creation!");
            this.logger.error(e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @MatrixEventHandler
    public void _onMessageEvent(MessageMatrixEvent event) {
        if(event.sender.startsWith("@!discord_") || event.sender.startsWith("@" + this.getAppservice().getRegistration().getSenderLocalpart())) {
            return; // We don't want message echo from our own bots
        }

        try {
            this.messageEventsHandler.bridgeMatrixToDiscord(event);
        } catch (IOException e) {
            this.logger.warn("Error while processing Matrix message");
            this.logger.error("IOException: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @MatrixEventHandler
    public void _onMemberEvent(RoomMemberMatrixEvent event) {
        // TODO
    }

    public void setMatrixAvatarFromDiscord(MatrixUserClient userClient, User discordUser) throws IOException {
        try {
            var avatarFile = new File(this.tmpDir + File.separator + discordUser.getAvatarId() + ".png");

            FileUtils.copyURLToFile(new URL(discordUser.getAvatarUrl()), avatarFile); // Download the avatar

            var mxcURL = this.getClientManager().uploadMatrixFromFile(avatarFile.getPath()); // Upload it to matrix
            userClient.setAvatarURL(mxcURL); // Set the URL

            avatarFile.delete(); // Delete it as we don't need it anymore
        } catch (MalformedURLException e) {
            this.logger.warn("MalformedURLException while uploading avatar file for discord user: " + discordUser.getName());
            e.printStackTrace();
        } catch (MatrixNetworkException e) {
            e.printStackTrace();
        }
    }

    public String getUserIdForDiscordUser(User discordUser) {
        return "@" + MatrixDiscordBridge.USER_PREFIX + discordUser.getId() + ":" + this.getConfig().getMatrixDomain();
    }

    public Logger getLogger() {
        return this.logger;
    }

    public File getTmpDir() {
        return this.tmpDir;
    }

    public DiscordBridgeConfig getDiscordConfig() {
        return this.discordConfig;
    }

    public JDA getJDA() {
        return this.jda;
    }

    public BridgingConnector getConnector() {
        return this.connector;
    }

    public DatabaseManagement getDbManagement() {
        return this.databaseManagement;
    }

    public MessageEventsHandler getMessageEventsHandler() {
        return this.messageEventsHandler;
    }

    public CommandHandler getCommandHandler() {
        return this.commandHandler;
    }

    public PresenceHandler getPresenceHandler() {
        return this.presenceHandler;
    }

    public UserEventsHandler getUserEventsHandler() {
        return this.userEventsHandler;
    }

    public WebhookManager getWebhookManager() {
        return this.webhookManager;
    }

    public EmojiManager getEmojiManager() {
        return this.emojiManager;
    }
}
