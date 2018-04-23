import * as Discord from "discord.js";
import { RemoteUser, MatrixRoom } from "matrix-appservice-bridge";

import * as matrix from "./matrix";

import { DiscordBot } from "./discord";

import * as fs from "fs";

export class DiscordCommandHandler {
    private discordBot: DiscordBot;

    constructor(discordBot: DiscordBot) {
        this.discordBot = discordBot;
    }

    public handleDiscordCommand(message: Discord.Message, bridged: boolean, roomId, intent, remoteRoom, bridgeStore) {
        if(message.author.bot) {
            this.discordBot.getBridge().logger.warn("Dropped discord command, user is a bot. ", {
                username: message.author.username,
                message: message.cleanContent
            });
            return;
        }

        if(message.cleanContent.startsWith("$invite")) { // $invite: invite a matrix user to the corresponding bridged matrix room
            if(!bridged) {
                // Can't invite a user to a non-existant room!
                let matrixRoomAlias = "#!discord_#" + (message.channel as Discord.TextChannel).name + ";" + (message.channel.id.substr(message.channel.id.length - 4));
                message.reply("This room **isn't bridged!** Please bridge this room first by using the ***$bridge *** command or joining the ***" + matrixRoomAlias + "*** matrix room.");
                return;
            }

            this.handleInviteCommand(message, roomId, intent);
        } else if(message.cleanContent.startsWith("$unbridge")) {
            if(!bridged) {
                // Can't unbridge a room that doesn't exist!
                message.reply("This room **isn't bridged!**");
                return;
            }

            this.handleUnbridgeCommand(message, roomId, intent, remoteRoom, bridgeStore);
        } else if(message.cleanContent.startsWith("$bridge")) {
            if(bridged) {
                // Can't bridge a room that's already bridged!
                message.reply("This room is **already bridged!**");
                return;
            }

            this.handleBridgeCommand(message, roomId, intent, remoteRoom, bridgeStore);
        }
    }

    private handleInviteCommand(message: Discord.Message, roomId, intent) {
        let split = message.cleanContent.split(" ");

        if(split.length > 1) {
            intent.invite(roomId, split[1]).then(() => {
                message.reply("Invited *" + split[1] + "* to the room.");
            }).catch((e) => {
                this.discordBot.getBridge().logger.error("While attempting to process room invite from discord to matrix:");
                this.discordBot.getBridge().logger.error(e);

                message.reply("Sorry, there was an error while processing.");
            });
        } else {
            message.reply("Incorrect format, $invite [user address]");
        }
    }

    private handleUnbridgeCommand(message: Discord.Message, roomId, intent, remoteRoom, bridgeStore) {
        if(!message.member.hasPermission(Discord.Permissions.FLAGS.MANAGE_GUILD)) {
            message.reply("You do not have the MANAGE_GUILD (Manage Server) permission needed for this command.");
            return;
        }

        if(remoteRoom.data.customBridge) {
            this.discordBot.getBridge().logger.info("Deleting bridged discord channel #" + (message.channel as Discord.TextChannel));
            message.channel.send("**This room is now** ***no longer*** **bridged.**");

            let roomNumber = (message.channel.id.substr(message.channel.id.length - 4));
            let part2 = (message.channel as Discord.TextChannel).name + ";" + roomNumber;

            this.discordBot.handleChannelDelete(roomNumber, (message.channel as Discord.TextChannel).name, message.channel.id, "The Discord channel this room is bridged to is being unbridged.", remoteRoom.data.customBridge);

            bridgeStore.removeEntriesByRemoteRoomId(part2).then(() => {
                remoteRoom.data.customBridge = false;
                bridgeStore.upsertEntry({
                    id: part2,
                    matrix: null,
                    remote: remoteRoom.remote,
                    data: remoteRoom.data
                }).then(() => {
                    // Go through each member in the channel, and remove them from the room
                    (message.channel as Discord.TextChannel).members.forEach((member, key, map) => {
                        let userIntent = this.discordBot.getBridge().matrixAppservice.getIntentForUser(member.user.id);
                        userIntent.leave(remoteRoom.matrix.roomId);
                    });
                }).catch((err) => this.discordBot.getBridge().logger.error(err));
            });
        } else {
            message.reply("This room is not custom bridged!");
        }
    }

    private handleBridgeCommand(message: Discord.Message, roomId, intent, remoteRoom, bridgeStore) {
        if(!message.member.hasPermission(Discord.Permissions.FLAGS.MANAGE_GUILD)) {
            message.reply("You do not have the MANAGE_GUILD (Manage Server) permission needed for this command.");
        }

        let split = message.cleanContent.split(" ");

        if(split.length > 1) {
            if(remoteRoom.data.customBridge) {
                message.reply("This room is already custom bridged!");
                return;
            }

            let part2 = (message.channel as Discord.TextChannel).name + ";" + (message.channel.id.substr(message.channel.id.length - 4));

            this.discordBot.getBridge().logger.info("Custom bridging discord channel #" + (message.channel as Discord.TextChannel) + " to room: " + split[1]);

            let matrixRoom = new MatrixRoom(split[1]);

            remoteRoom.data.customBridge = true;

            this.discordBot.getBridge().matrixAppservice.matrixBridge.getIntent().join(split[1]).then(() => {
                bridgeStore.removeEntriesByRemoteRoomId(part2).then(() => {
                    bridgeStore.linkRooms(matrixRoom, remoteRoom.remote, remoteRoom.data, part2).then(() => {
                        // Go through each member in the channel and add them to the room
                        (message.channel as Discord.TextChannel).members.forEach((member, key, map) => {
                            let userIntent = this.discordBot.getBridge().matrixAppservice.getIntentForUser(member.user.id);

                            remoteRoom.matrix = {
                                roomId: split[1]
                            };
                            this.discordBot.setupNewUser(member, this.discordBot.getBridge().matrixAppservice.matrixBridge.getIntent(), userIntent, remoteRoom);
                        });

                        message.channel.send("**This channel is now** ***custom*** **bridged to:** *" + split[1] + "*");
                    }).catch((e) => this.discordBot.getBridge().logger.error(e));
                }).catch((e) => this.discordBot.getBridge().logger.error(e));
            }).catch((e) => {
                if(e.message = "Failed to join room") {
                    this.discordBot.getBridge().logger.warn("While custom bridging: failed to join room, maybe invite only?", {
                        roomId: split[1],
                        channel: message.channel.id
                    });

                    let botId = "@" + matrix.appserviceUserPart + ":" + this.discordBot.getBridge().config.matrix.domain;
                    message.reply("**Failed to join that room!** Perhaps it is **invite-only** or **doesn't exist**? Please either **invite** the bot user ***" + botId + "*** **or open room to anyone with the link**, and then **re-run this command**.");
                } else {
                    this.discordBot.getBridge().logger.error(e);
                    message.reply("Sorry, an error occured while attempting to bridge. Here's the message: ```" + e.message + "```");
                }
            });
        } else {
            message.reply("Incorrect format, $bridge [matrix internal room id]");
        }
    }
}
