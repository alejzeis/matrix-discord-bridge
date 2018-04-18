import * as Discord from "discord.js";
import { Converter } from "showdown";

import * as matrix from "./matrix";

import * as util from "./util";

import { DiscordMatrixBridge } from "./main";
import { DiscordBot } from "./discord";
import { MatrixAppservice } from "./matrix";

import { createReadStream, unlinkSync } from "fs";

const markdownConverter = new Converter();

function formatMatrixTextMessage(plaintext) {
    return {
        body: plaintext,
        msgtype: "m.text",
        formatted_body: markdownConverter.makeHtml(plaintext),
        format: "org.matrix.custom.html"
    }
}

function formatMatrixMediaMessage(attachment: Discord.MessageAttachment, url: string, mimetype: string, duration: number = -1): Promise<any> {
    return new Promise((resolve, reject) => {
        let type = util.determineFileMatrixType(attachment.filename);

        let content;
        content = {
            msgtype: "m.file",
            body: attachment.filename,
            filename: attachment.filename,
            url: url,
            info: {
                size: attachment.filesize,
                mimetype: mimetype
            }
        };

        switch(type) {
            case util.MatrixFileType.IMAGE:
                content.msgtype = "m.image";
                content.info.w = attachment.width;
                content.info.h = attachment.height;
                break;
            case util.MatrixFileType.AUDIO:
                content.msgtype = "m.audio";
                if(duration > 0)
                    content.info.duration = (duration * 1000);
                break;
            case util.MatrixFileType.VIDEO:
                content.msgtype = "m.video";
                break;
        }

        resolve(content);
    });
}

export function processDiscordToMatrixMessage(message: Discord.Message, discordBot: DiscordBot, matrixRoomId: string, intent) {
    if(message.attachments.size > 0) {
        let attachment = message.attachments.values().next().value;
        util.download(attachment.url, attachment.filename, (mimetype, downloadedLocation) => {
            util.uploadMatrix(createReadStream(downloadedLocation), attachment.filename, mimetype, intent.getClient()).then((url) => {
                // Get the type of matrix content we are dealing with
                let type = util.determineFileMatrixType(attachment.filename);
                if(type == util.MatrixFileType.AUDIO) {
                    // Try to find the audio duration
                    // These are the file types supported by the "musicmetadata" library
                    if(attachment.filename.endsWith(".mp3") || attachment.filename.endsWith(".mp4") || attachment.filename.endsWith(".ogg")
                        || attachment.filename.endsWith(".flac") || attachment.filename.endsWith(".wma") || attachment.filename.endsWith(".wmv")) {

                        util.determineAudioFileDuration(createReadStream(downloadedLocation)).then((duration) => {
                            let content = formatMatrixMediaMessage(attachment, url, mimetype, duration).then((content) => {
                                intent.sendMessage(matrixRoomId, content)
                                    .done(() => unlinkSync(downloadedLocation)); // Delete the temporary downloaded file once we are all done
                            });
                        }).catch((err) => {
                            console.error("Error while attempting to read audio file duration.")
                            console.error(err);
                        });
                    } else {
                        // We can't figure out the duration, so send anyway
                        let content = formatMatrixMediaMessage(attachment, url, mimetype).then((content) => {
                            intent.sendMessage(matrixRoomId, content)
                                .done(() => unlinkSync(downloadedLocation)); // Delete the temporary downloaded file once we are all done
                        });
                    }
                } else {
                    // The media is not audio, no need to find duration
                    let content = formatMatrixMediaMessage(attachment, url, mimetype).then((content) => {
                        intent.sendMessage(matrixRoomId, content)
                            .done(() => unlinkSync(downloadedLocation)); // Delete the temporary downloaded file once we are all done
                    });
                }
            });
        });
    } else if (message.embeds != null && message.embeds.length > 0) {
        // TODO: embeds
    } else {
        // TODO: mentions
        intent.sendMessage(matrixRoomId, formatMatrixTextMessage(message.cleanContent));
    }
}

let webhookCreationLock = {};

export function processMatrixToDiscordMessage(event, channel: Discord.TextChannel, serverURL: string, appservice: MatrixAppservice) {
    let sentMessage: string;

    if(webhookCreationLock[event.sender]) {
        setTimeout(function() {
            processMatrixToDiscordMessage(event, channel, serverURL, appservice);
        }, 200);
        return;
    }

    getWebhook(event, channel, appservice.getBridge()).then((webhook) => {
        switch(event.content.msgtype) {
            case "m.text":
                webhook.send("**" + event.sender + "**: " + event.content.body);
                return;

            case "m.file":
                sentMessage = "sent a file: ";
                break;
            case "m.image":
                sentMessage = "sent an image: ";
                break;
            case "m.video":
                sentMessage = "sent a video: ";
                break;
            case "m.audio":
                sentMessage = "sent an audio file: ";
                break;

            default:
                return;
        }

        let downloadURL = util.getMXCDownloadURL(event.content.url, appservice.getBridge().config);
        // Check if file size is greater than 8 MB, discord does not allow files greater than 8 MB
        if(event.content.info.size >= (1024*1024*8)) {
            // File is too big, send link then
            webhook.send("**" + event.sender + "**: ***" + sentMessage + "*** " + downloadURL);
        } else {
            util.download(downloadURL, event.content.body, (contentType, downloadedLocation) => {
                webhook.send("**" + event.sender + "**: ***" + sentMessage + "*** " + event.content.body, new Discord.Attachment(downloadedLocation, event.content.body))
                    .then(() => unlinkSync(downloadedLocation));
                    // Delete the image we downloaded after we uploaded it
            });
        }
    });
}

function getWebhook(event, channel: Discord.TextChannel, bridge: DiscordMatrixBridge): Promise<Discord.Webhook> {
    let userStore = bridge.matrixAppservice.matrixBridge.getUserStore();

    if(!webhookCreationLock[event.sender]) {
        webhookCreationLock[event.sender] = true;
    }

    return new Promise((resolve, reject) => {
        userStore.getMatrixUser(event.sender).then((user) => {
            let userWebhooks = user.get("webhooks");
            if(!userWebhooks) {
                userWebhooks = {};
            }

            if(Object.keys(userWebhooks).length > 0) { // Check if webhooks dictionary is empty or not
                if(userWebhooks[channel.id]) { // check if there is already a webhook in here
                    channel.fetchWebhooks().then((webhooks) => {
                        webhookCreationLock[event.sender] = false;
                        resolve(webhooks.get(userWebhooks[channel.id]));
                    });
                    return;
                }
            }

            // No webhooks found

            channel.createWebhook(user.getDisplayName(), util.getMXCDownloadURL(user.get("avatarURL"), bridge.config)).then((webhook) => {
                userWebhooks[channel.id] = webhook.id;
                user.set("webhooks", userWebhooks);

                userStore.setMatrixUser(user).then(() => {
                    webhookCreationLock[event.sender] = false;
                    resolve(webhook);
                });
            });
        });
    });
}
