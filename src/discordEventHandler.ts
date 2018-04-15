import * as Discord from "discord.js";
import { RemoteUser, MatrixRoom } from "matrix-appservice-bridge";

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
                let domain = this.discordBot.getBridge().config.matrix.domain;

                this.discordBot.tryInsertNewRemoteRoom(this.discordBot, roomNumber, channel.guild, channel, canInvite, canAccess).then(() => {
                    channel.send("**This room is now bridged to:** *#!discord_#" + channel.name + ";" + roomNumber + ":" + domain + "*");
                    console.log("Successfully added new remote room " + channel.name + ";" + roomNumber);
                });
            }
        }
    }

    public onChannelDelete(channel: Discord.Channel) {
        if(channel instanceof Discord.GuildChannel && channel instanceof Discord.TextChannel) {
            let roomNumber = channel.id.substr(channel.id.length - 4);
            let domain = this.discordBot.getBridge().config.matrix.domain;

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
        let bridgeStore = discordBot.getBridge().matrixAppservice.matrixBridge.getRoomStore();

        // Retrieve the bridged matrix room ID that belongs to the channel
        this.discordBot.getBridge().matrixAppservice.getMatrixRoomFromDiscordInfo(message.guild.id, message.channel.id).then((remoteRoom) => {
            if(remoteRoom.matrix != null && remoteRoom.matrix.roomId != null) {
                let roomId = remoteRoom.matrix.roomId;

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
            } else {
                if(message.cleanContent.startsWith("$bridge")) {
                    let split = message.cleanContent.split(" ");

                    if(split.length > 1) {
                        console.log(remoteRoom);

                        let part2 = (message.channel as Discord.TextChannel).name + ";" + (message.channel.id.substr(message.channel.id.length - 4));

                        console.log("New bridged room: " + split[1]);

                        let matrixRoom = new MatrixRoom(split[1]);

                        bridgeStore.removeEntriesByRemoteRoomId(part2).then(() => {
                            bridgeStore.linkRooms(matrixRoom, remoteRoom.remote, remoteRoom.data, part2).then(() => {
                                discordBot.getBridge().matrixAppservice.matrixBridge.getIntent().join(split[1]).then(() => {
                                    // Go through each member in the channel
                                    (message.channel as Discord.TextChannel).members.forEach((member, key, map) => {
                                        let userIntent = discordBot.getBridge().matrixAppservice.getIntentForUser(member.user.id);

                                        remoteRoom.matrix = {
                                            roomId: split[1]
                                        };
                                        discordBot.setupNewUser(member, discordBot.getBridge().matrixAppservice.matrixBridge.getIntent(), userIntent, remoteRoom);
                                    });
                                }).catch((e) => console.error(e));
                            }).catch((e) => console.error(e));
                        });
                    }
                }
            }
        }).catch((e) => { console.error(e); });
    }

    public onTypingStart(channel: Discord.Channel, user: Discord.User) {
        this._typingStartOrStop(channel, user, true);
    }

    public onTypingStop(channel: Discord.Channel, user: Discord.User) {
        this._typingStartOrStop(channel, user, false);
    }

    private _typingStartOrStop(channel: Discord.Channel, user: Discord.User, typing: boolean) {
        // We don't want echo from our bot (eg. typing to matrix that are from our own bot on discord)
        if(user.username == this.discordBot.getBridge().config.discord.username) return;

        let discordBot = this.discordBot;
        let intent = discordBot.getBridge().matrixAppservice.getIntentForUser(user.id);

        if(!(channel instanceof Discord.GuildChannel)) return;

        // Retrieve the bridged matrix room ID that belongs to the channel
        this.discordBot.getBridge().matrixAppservice.getMatrixRoomFromDiscordInfo(channel.guild.id, channel.id).then((remoteRoom) => {
            let roomId = remoteRoom.matrix.roomId;
            if(roomId != null && roomId != "") {
                intent.sendTyping(roomId, typing);
            }
        }).catch((e) => { /* The room is probably not bridged, so ignore */ });
    }
}
