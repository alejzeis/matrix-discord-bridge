package io.github.jython234.matrix.bridges.discord;

import net.dv8tion.jda.core.entities.Channel;

import javax.imageio.ImageIO;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.UnsupportedAudioFileException;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;

public class Util {
    public static String getRoomIdForChannel(Channel channel) {
        return "#" + channel.getName() + ";" + channel.getId().substring(channel.getId().length() - 4);
    }

    public static String getRoomIdForChannel(Channel channel, String name) {
        return "#" + name + ";" + channel.getId().substring(channel.getId().length() - 4);
    }

    public static long getAudioFileDuration(File file) throws IOException, UnsupportedAudioFileException {
        var audioInputStream = AudioSystem.getAudioInputStream(file);
        var format = audioInputStream.getFormat();

        return (long) (1000 * audioInputStream.getFrameLength() / format.getFrameRate());
    }

    public static void scaleImageAndSave(File source, File dest) throws IOException {
        var img = ImageIO.read(source); // Our source file
        var imgScaled = new BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB); // Scaled file

        Graphics2D graphics = imgScaled.createGraphics();
        // Create transparent background
        graphics.setComposite(AlphaComposite.Clear);
        graphics.fillRect( 0, 0, 32, 32);

        // Draw our source image scaled onto the transparent background
        graphics.setComposite(AlphaComposite.Src);
        graphics.setRenderingHint( RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR );
        graphics.drawImage(img, 0, 0, 32, 32, null);

        ImageIO.write(imgScaled, "PNG", dest); // Save the image
    }
}
