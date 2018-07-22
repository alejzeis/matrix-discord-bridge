package io.github.jython234.matrix.bridges.discord;

import net.dv8tion.jda.core.entities.Channel;

import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.UnsupportedAudioFileException;
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
}
