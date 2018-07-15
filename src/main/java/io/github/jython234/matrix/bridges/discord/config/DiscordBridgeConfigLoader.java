package io.github.jython234.matrix.bridges.discord.config;

import io.github.jython234.matrix.appservice.exception.KeyNotFoundException;
import org.yaml.snakeyaml.Yaml;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.util.Map;

/**
 * Configuration loader for the discord specific bridge settings.
 *
 * @author jython234
 */
public class DiscordBridgeConfigLoader {
    public static DiscordBridgeConfig loadFromFile(String location) throws FileNotFoundException, KeyNotFoundException {
        return loadFromFile(new File(location));
    }

    public static DiscordBridgeConfig loadFromFile(File file) throws FileNotFoundException, KeyNotFoundException {
        var yaml = new Yaml();
        var config = new DiscordBridgeConfig();

        Map map = yaml.load(new FileInputStream(file));

        Map discord = (Map) map.get("discord");
        if(discord == null) {
            throw new KeyNotFoundException("Failed to find key \"discord\" in config file!");
        }

        config.discord.token = (String) discord.get("token");

        if(config.discord.token == null) {
            throw new KeyNotFoundException("Failed to find all required keys in \"discord\" section!");
        }

        return config;
    }
}
