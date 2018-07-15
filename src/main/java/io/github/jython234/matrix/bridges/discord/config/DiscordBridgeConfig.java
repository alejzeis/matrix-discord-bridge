package io.github.jython234.matrix.bridges.discord.config;

/**
 * Represents the bridge configuration for discord.
 *
 * @author jython234
 */
public class DiscordBridgeConfig {
    Discord discord;

    DiscordBridgeConfig() {
        this.discord = new Discord();
    }

    public static class Discord {
        /**
         * Discord bot token.
         */
        String token;

        public String getToken() {
            return token;
        }
    }

    public Discord getDiscord() {
        return discord;
    }
}
