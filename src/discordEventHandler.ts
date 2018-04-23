import * as Discord from "discord.js";
import { RemoteUser, MatrixRoom } from "matrix-appservice-bridge";

import * as matrix from "./matrix";

import { DiscordBot } from "./discord";
import { processDiscordToMatrixMessage } from "./messageHandling";
import { DiscordCommandHandler } from "./discordCommandHandler";
import { download } from "./util";

import * as fs from "fs";

export class DiscordEventHandler {
    private discordBot: DiscordBot;
    private commandHandler: DiscordCommandHandler;

    constructor(discordBot: DiscordBot) {
        this.discordBot = discordBot;
        this.commandHandler = new DiscordCommandHandler(discordBot);
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
                    this.discordBot.getBridge().logger.info("Successfully bridged new channel " + channel.name);
                });
            }
        }
    }

    public onChannelDelete(channel: Discord.Channel) {
        if(channel instanceof Discord.GuildChannel && channel instanceof Discord.TextChannel) {
            let roomNumber = channel.id.substr(channel.id.length - 4);
            let domain = this.discordBot.getBridge().config.matrix.domain;

            this.discordBot.getBridge().logger.info("Processing channel deletion: " + channel.id + " #" + channel.name);

            // Delete the old webhooks for this channel from the database
            this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore().getByMatrixData({
                webhookUser: true
            }).then((users: Array<any>) => {
                users.forEach((user) => {
                    let userWebhooks = user.get("webhooks");

                    if(userWebhooks && Object.keys(userWebhooks).length > 0) { // Check if webhooks dictionary is empty or not
                        if(userWebhooks[channel.id]) { // check if there is a webhook for the to-be-deleted channel
                            delete userWebhooks[channel.id]; // Remove that webhook entry for that channel

                            this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore().setMatrixUser(user);
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
                    this.commandHandler.handleDiscordCommand(message, true, roomId, intent, remoteRoom, bridgeStore);
                } else {
                    processDiscordToMatrixMessage(message, discordBot, roomId, intent);
                }
            } else {
                if(message.cleanContent.startsWith("$")) {
                    this.commandHandler.handleDiscordCommand(message, false, null, intent, remoteRoom, bridgeStore);
                }
            }
        }).catch((e) => { this.discordBot.getBridge().logger.error(e); });
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

    public onGuildMemberUpdate(oldMember: Discord.GuildMember, newMember: Discord.GuildMember) {
        let discordBot = this.discordBot;
        let userStore = this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore();

        userStore.getRemoteUser(oldMember.user.id).then((user) => {
            if(user != null) {
                let intent = discordBot.getBridge().matrixAppservice.getIntentForUser(oldMember.user.id);
                let name = (newMember.nickname != null ? newMember.nickname : newMember.user.username);

                // Set our display name if it's changed
                if(user.data.name != name) {
                    intent.setDisplayName(name + (newMember.user.bot ? " [BOT]" : "") + " (Discord)").then(() => {
                        user.set("name", name);

                        userStore.setRemoteUser(user);
                    });
                }
            }
        });
    }

    public onUserUpdate(oldUser: Discord.User, newUser: Discord.User) {
        let discordBot = this.discordBot;
        let userStore = this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore();

        userStore.getRemoteUser(oldUser.id).then((user) => {
            if(user != null) {
                let intent = discordBot.getBridge().matrixAppservice.getIntentForUser(oldUser.id);

                // Check if their avatar has changed
                if(user.data.avatar != newUser.avatar) {
                    let filename = newUser.avatar + ".png";

                    download(newUser.avatarURL, filename, (mimetype, downloadedLocation) => {
                        discordBot.getBridge().matrixAppservice.uploadContent(fs.createReadStream(downloadedLocation), filename, mimetype).then((url) => {
                            fs.unlinkSync(downloadedLocation); // Remove the temporary avatar file we downloaded

                            intent.setAvatarUrl(url).then(() => {
                                user.set("avatar", newUser.avatar);

                                userStore.setRemoteUser(user);
                            });
                        });
                    });
                }
            }
        });
    }

    public onPresenceUpdate(oldMember: Discord.GuildMember, newMember: Discord.GuildMember) {
        let discordBot = this.discordBot;
        let userStore = this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore();

        userStore.getRemoteUser(oldMember.user.id).then((user) => {
            if(user != null) {
                this.discordBot.setPresenceForMember(newMember);
            }
        });
    }
}
