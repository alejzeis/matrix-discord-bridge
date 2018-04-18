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

            // Delete the old webhooks for this channel from the database
            this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore().getByMatrixData({
                webhookUser: true
            }).then((users: Array<any>) => {
                users.forEach((user) => {
                    let userWebhooks = user.get("webhooks");
                    console.log("Found user: " + user.getDisplayName());

                    if(userWebhooks && Object.keys(userWebhooks).length > 0) { // Check if webhooks dictionary is empty or not
                        console.log("Not empty")
                        if(userWebhooks[channel.id]) { // check if there is a webhook for the to-be-deleted channel
                            console.log("Found webhook");
                            delete userWebhooks[channel.id]; // Remove that webhook entry for that channel

                            console.log("Deleted");

                            this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore().setMatrixUser(user).then(() => {
                                console.log("deleted");
                            });
                        }
                    }
                });
            });

            this.discordBot.handleChannelDelete(roomNumber, channel.name, channel.id);
        }
    }

    public onChannelUpdate(oldChannel: Discord.Channel, newChannel: Discord.Channel) {
        // TODO
    }

    public onMessage(message: Discord.Message) {
        // We don't want echo from our bot (eg. sending messages to matrix that are from our own bot on discord)
        if(message.author.username == this.discordBot.getBridge().config.discord.username) return;
        // We don't want echo from our webhook bots
        if(message.webhookID) return;

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
                    } else if(message.cleanContent.startsWith("$unbridge")) {
                        if(!message.member.hasPermission(Discord.Permissions.FLAGS.MANAGE_GUILD)) {
                            message.reply("You do not have the MANAGE_GUILD permission needed for this command.");
                        }

                        if(remoteRoom.data.customBridge) {
                            message.channel.send("**This room is now** ***no longer*** **custom bridged.**");

                            let roomNumber = (message.channel.id.substr(message.channel.id.length - 4));
                            let part2 = (message.channel as Discord.TextChannel).name + ";" + roomNumber;

                            this.discordBot.handleChannelDelete(roomNumber, (message.channel as Discord.TextChannel).name, message.channel.id, "The Discord channel this room is bridged to is being unbridged.", true);

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
                                        let userIntent = discordBot.getBridge().matrixAppservice.getIntentForUser(member.user.id);
                                        userIntent.leave(remoteRoom.matrix.roomId);
                                    });
                                }).catch((err) => console.error(err));
                            });
                        } else {
                            message.reply("This room is not custom bridged!");
                        }
                    }
                } else {
                    processDiscordToMatrixMessage(message, discordBot, roomId, intent);
                }
            } else {
                if(message.cleanContent.startsWith("$bridge")) {
                    if(!message.member.hasPermission(Discord.Permissions.FLAGS.MANAGE_GUILD)) {
                        message.reply("You do not have the MANAGE_GUILD permission needed for this command.");
                    }

                    let split = message.cleanContent.split(" ");

                    // TODO: Check permissions for bridging

                    if(split.length > 1) {
                        if(remoteRoom.data.customBridge) {
                            message.reply("This room is already custom bridged!");
                            return;
                        }

                        let part2 = (message.channel as Discord.TextChannel).name + ";" + (message.channel.id.substr(message.channel.id.length - 4));

                        console.log("New bridged room: " + split[1]);
                        message.channel.send("**This room is now** ***custom*** **bridged to:** *" + split[1] + "*");

                        let matrixRoom = new MatrixRoom(split[1]);

                        remoteRoom.data.customBridge = true;

                        bridgeStore.removeEntriesByRemoteRoomId(part2).then(() => {
                            bridgeStore.linkRooms(matrixRoom, remoteRoom.remote, remoteRoom.data, part2).then(() => {
                                discordBot.getBridge().matrixAppservice.matrixBridge.getIntent().join(split[1]).then(() => {
                                    // Go through each member in the channel and add them to the room
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
