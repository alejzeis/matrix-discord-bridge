import * as Discord from "discord.js";
import { Converter } from "showdown";

import * as matrix from "./matrix";

import { DiscordBot } from "./discord";
import { MatrixAppservice } from "./matrix";

const markdownConverter = new Converter();

function formatMatrixTextMessage(plaintext) {
    return {
        body: plaintext,
        msgtype: "m.text",
        formatted_body: markdownConverter.makeHtml(plaintext),
        format: "org.matrix.custom.html"
    }
}

export function processDiscordToMatrixMessage(message: Discord.Message, discordBot: DiscordBot, matrixRoomId: string) {
    let intent = discordBot.getBridge().matrixAppservice.getIntentForUser(message.author.id);

    if(message.attachments.size > 0) {
        // TODO: Process attachments
    } else if (message.embeds != null && message.embeds.length > 0) {

    } else {
        // TODO: mentions
        intent.sendMessage(matrixRoomId, formatMatrixTextMessage(message.cleanContent));
    }
}
