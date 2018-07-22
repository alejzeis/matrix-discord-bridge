package io.github.jython234.matrix.bridges.discord.handler;

import io.github.jython234.matrix.bridge.network.MatrixNetworkException;
import io.github.jython234.matrix.bridges.discord.MatrixDiscordBridge;
import io.github.jython234.matrix.bridges.discord.Util;
import net.dv8tion.jda.core.JDA;
import net.dv8tion.jda.core.entities.Emote;
import org.apache.commons.io.FileUtils;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.net.URL;

public class EmojiManager {
    private MatrixDiscordBridge bridge;

    public EmojiManager(MatrixDiscordBridge bridge) {
        this.bridge = bridge;
    }

    public void syncEmojis(JDA jda) {
        this.bridge.getLogger().info("Syncing custom emotes...");
        jda.getGuilds().forEach(guild -> guild.getEmotes().forEach(this::syncEmoji));
    }

    private void downloadEmoteToFile(Emote emote, File file) throws IOException {
        FileUtils.copyURLToFile(new URL(emote.getImageUrl()), file);
    }

    public void syncEmoji(Emote emote) {
        try {
            if(this.bridge.getDatabase().getExtraData("emote-"+emote.getId()) == null) {
                var tmpFile = new File(this.bridge.getTmpDir() + File.separator + emote.getId() + ".png");
                downloadEmoteToFile(emote, tmpFile);

                var scaledFile = new File(this.bridge.getTmpDir() + File.separator + emote.getId() + "-scaled.png");
                Util.scaleImageAndSave(tmpFile, scaledFile);

                var mxcUrl = this.bridge.getClientManager().uploadMatrixFromFile(scaledFile.getPath());
                tmpFile.delete();
                scaledFile.delete();

                this.bridge.getDatabase().putExtraData("emote-" + emote.getId(), mxcUrl);
            }
        } catch (MatrixNetworkException | IOException e) {
            this.bridge.getLogger().warn("Failed to sync custom emote " + emote.getId() + " :" + emote.getName() + ":");
            this.bridge.getLogger().error(e.getClass() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void deleteEmoji(Emote emote) throws IOException {
        this.bridge.getDatabase().deleteExtraData("emote-" + emote.getId());
    }

    public String getMXCEmoji(Emote emote) throws IOException {
        return (String) this.bridge.getDatabase().getExtraData("emote-" + emote.getId());
    }
}
