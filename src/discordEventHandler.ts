import * as Discord from "discord.js";
import { RemoteUser } from "matrix-appservice-bridge";

import * as matrix from "./matrix";

import { DiscordBot } from "./discord";
import { processDiscordToMatrixMessage } from "./messageHandling";

export class DiscordEventHandler {
    private discordBot: DiscordBot;

    constructor(discordBot: DiscordBot) {
        this.discordBot = discordBot;
    }

    public onChannelCreate(channel: Discord.Channel) {
        if(channel instanceof Discord.GuildChannel && channel instanceof Discord.TextChannel) {
            let permissions = channel.permissionsFor(this.discordBot.getClient().user);
            let canAccess = permissions.has(Discord.Permissions.FLAGS.VIEW_CHANNEL);
            let canInvite = permissions.has(Discord.Permissions.FLAGS.CREATE_INSTANT_INVITE);

            if(canAccess) {
                let roomNumber = channel.id.substr(channel.id.length - 4);

                this.discordBot.tryInsertNewRemoteRoom(this.discordBot, roomNumber, channel.guild, channel, canInvite, canAccess).then(() => {
                    console.log("Successfully added new remote room " + channel.name + ";" + roomNumber);
                });
            }
        }
    }

    public onChannelDelete(channel: Discord.Channel) {
        if(channel instanceof Discord.GuildChannel && channel instanceof Discord.TextChannel) {
            let roomNumber = channel.id.substr(channel.id.length - 4);
            this.discordBot.handleChannelDelete(roomNumber, channel.name, channel.id);
        }
    }

    public onChannelUpdate(oldChannel: Discord.Channel, newChannel: Discord.Channel) {
        // TODO
    }

    public onMessage(message: Discord.Message) {
        // We don't want echo from our bot (eg. sending messages to matrix that are from our own bot on discord)
        if(message.author.username == this.discordBot.getBridge().config.discord.username) return;

        let discordBot = this.discordBot;
        let intent = discordBot.getBridge().matrixAppservice.getIntentForUser(message.author.id);

        // Retrieve the bridged matrix room ID that belongs to the channel
        this.discordBot.getBridge().matrixAppservice.getMatrixRoomIdFromDiscordInfo(message.guild.id, message.channel.id).then((roomId) => {
            if(roomId != null && roomId != "") {
                if(message.cleanContent.startsWith("$")) {
                    if(message.cleanContent.startsWith("$invite")) {
                        let split = message.cleanContent.split(" ");

                        if(split.length > 1) {
                            intent.invite(roomId, split[1]).then(() => {
                                message.reply("Invited *" + split[1] + "* to the room.");
                            }).catch((e) => {
                                console.error("Error while attempting to process room invite from discord to matrix.");
                                console.error(e);
                                message.reply("Sorry, there was an error while processing.");
                            });
                        } else {
                            message.reply("Incorrect format, $invite [user address]");
                        }
                    }
                } else {
                    processDiscordToMatrixMessage(message, discordBot, roomId, intent);
                }
            }
        });
    }
}
