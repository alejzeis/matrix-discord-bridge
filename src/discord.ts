import * as Discord from "discord.js";
import { RemoteRoom, RemoteUser } from "matrix-appservice-bridge";
import * as uuidv4 from "uuid/v4";

import * as matrix from "./matrix";
import { DiscordMatrixBridge } from "./main";
import { DiscordEventHandler } from "./discordEventHandler";
import * as util from "./util";

import * as fs from "fs";

var self: DiscordBot;
export class DiscordBot {
    private bridge: DiscordMatrixBridge;
    private client: Discord.Client;

    private eventHandler: DiscordEventHandler;

    getBridge(): DiscordMatrixBridge { return this.bridge; }
    getClient(): Discord.Client { return this.client; }

    constructor(bridge: DiscordMatrixBridge) {
        this.bridge = bridge;
        this.eventHandler = new DiscordEventHandler(this);

        this.client = new Discord.Client();

        this.client.on("ready", this.onReady);

        this.client.on("channelCreate", this.eventHandler.onChannelCreate.bind(this.eventHandler));
        this.client.on("channelDelete", this.eventHandler.onChannelDelete.bind(this.eventHandler));
        this.client.on("channelUpdate", this.eventHandler.onChannelUpdate.bind(this.eventHandler));
        this.client.on("message", this.eventHandler.onMessage.bind(this.eventHandler));
        this.client.on("typingStart", this.eventHandler.onTypingStart.bind(this.eventHandler));
        this.client.on("typingStop", this.eventHandler.onTypingStop.bind(this.eventHandler));

        self = this;
    }

    public run() {
        this.client.login(this.bridge.config.discord.token);
    }

    public getChannel(guild, channel): Discord.GuildChannel {
        return this.client.guilds.get(guild).channels.get(channel);
    }

    public setupNewProvisionedRoom(room: string) {
        let intent = self.bridge.matrixAppservice.matrixBridge.getIntent();

        self.bridge.matrixAppservice.matrixBridge.getRoomStore().getEntryById(room).then((entry) => {
            if(entry.matrix != null) {
                let guildId = entry.remote.get("guild");
                let channelId = entry.remote.get("channel");

                let channel: Discord.TextChannel = self.client.guilds.get(guildId).channels.get(channelId) as Discord.TextChannel;

                // Go through each member in the channel
                channel.members.forEach((member, key, map) => {
                    let userIntent = self.bridge.matrixAppservice.getIntentForUser(member.user.id);

                    self.setupNewUser(member, intent, userIntent, entry);
                });
            }
        }).catch((err) => console.error(err));
    }

    private onReady() {
        console.log("Connected to Discord.");

        self.client.guilds.forEach((guild) => {
            guild.channels.forEach((channel) => {
                if(channel instanceof Discord.TextChannel) {
                    let permissions = channel.permissionsFor(self.client.user);
                    let canAccess = permissions.has(Discord.Permissions.FLAGS.VIEW_CHANNEL);
                    let canInvite = permissions.has(Discord.Permissions.FLAGS.CREATE_INSTANT_INVITE);

                    if(canAccess) {
                        let roomNumber = channel.id.substr(channel.id.length - 4);
                        let intent = self.bridge.matrixAppservice.matrixBridge.getIntent();

                        self.tryInsertNewRemoteRoom(self, roomNumber, guild, channel, canInvite, canAccess).then(() => {

                            // Process and add users to room

                            self.bridge.matrixAppservice.matrixBridge.getRoomStore().getEntryById(channel.name + ";" + roomNumber).then((entry) => {
                                if(entry.matrix != null) {
                                    // Go through each member in the channel
                                    channel.members.forEach((member, key, map) => {
                                        let userIntent = self.bridge.matrixAppservice.getIntentForUser(member.user.id);

                                        self.setupNewUser(member, intent, userIntent, entry);
                                    });
                                }
                            }).catch((err) => console.error(err));
                        });
                    }
                }
            });
        });

        self.setPresences.bind(self)();
        setInterval(self.setPresences.bind(self), 30000);
    }

    public tryInsertNewRemoteRoom(self: DiscordBot, roomNumber, guild: Discord.Guild, channel: Discord.TextChannel, canInvite: boolean, canAccess: boolean): Promise<any> {
        let intent = self.bridge.matrixAppservice.matrixBridge.getIntent();
        let roomStore = self.bridge.matrixAppservice.matrixBridge.getRoomStore();

        let roomId = channel.name + ";" + roomNumber;
        return new Promise((resolve, reject) => {
            roomStore.getEntryById(roomId).then((entry) => {
                console.log("Entry for (" + roomId + "): " + entry);
                if(entry == null) {
                    console.log("Creating entry and inserting.");
                    let room = new RemoteRoom(roomId);
                    room.set("type", "discord-text");
                    room.set("guild", guild.id);
                    room.set("channel", channel.id);
                    room.set("name", channel.name);
                    roomStore.upsertEntry({
                        id: roomId,
                        matrix: null,
                        remote: room,
                        data: {
                            matrixPreset: canInvite ? "public_chat" : "private_chat",
                            name: channel.name,
                            guild: guild.name,
                            topic: channel.topic,
                            visibility: canInvite ? "public" : "private"
                        }
                    }).then(() => resolve())
                    .catch((err) => reject(err));
                } else {
                    // Check if it matches our guild and channel
                    if(entry.remote.get("guild") == guild.id && entry.remote.get("channel") == channel.id) {
                        resolve();
                        return;
                    };

                    // Create a new room as it didn't match our guild and channel, so it's a different discord room we found.
                    self.tryInsertNewRemoteRoom(self, roomNumber - 1, guild, channel, canInvite, canAccess).then(() => resolve()).catch((err) => reject(err));
                }
            });
        });
    }

    private setupNewUser(member: Discord.GuildMember, intent, userIntent, remoteRoomEntry) {
        let userStore = self.bridge.matrixAppservice.matrixBridge.getUserStore();

        userStore.getRemoteUser(member.user.id).then((user) => {
            if(user != null) {

                let name = (member.nickname != null ? member.nickname : member.user.username);

                // Check if their avatar has changed
                if(user.data.avatar != member.user.avatar) {
                    let filename = member.user.avatar + ".png";

                    util.download(member.user.avatarURL, filename, (mimetype, downloadedLocation) => {
                        self.bridge.matrixAppservice.uploadContent(fs.createReadStream(downloadedLocation), filename, mimetype).then((url) => {
                            fs.unlinkSync(downloadedLocation); // Remove the temporary avatar file we downloaded

                            userIntent.setAvatarUrl(url).then(() => {
                                let newUser = new RemoteUser(member.user.id);

                                newUser.set("avatar", member.user.avatar);
                                newUser.set("rooms", user.data.rooms);
                                newUser.set("name", name);

                                userStore.delete({id: member.user.id }).then(() => {
                                    userStore.setRemoteUser(newUser);
                                });
                            });
                        });
                    });
                }

                // Check if we've already joined that room
                if(!user.data.rooms.includes(remoteRoomEntry.remote.get("channel"))) {
                    intent.invite(remoteRoomEntry.matrix.roomId, "@!discord_" + member.user.id + ":" + self.bridge.config.matrix.domain).then(() => {
                        userIntent.join(remoteRoomEntry.matrix.roomId).then(() => {
                            user.data.rooms.push(remoteRoomEntry.remote.get("channel"));

                            let newUser = new RemoteUser(member.user.id);

                            newUser.set("avatar", member.user.avatar);
                            newUser.set("rooms", user.data.rooms);
                            newUser.set("name", name);

                            userStore.delete({id: member.user.id }).then(() => {
                                userStore.setRemoteUser(newUser);
                            });
                        });
                    });
                }

                // Set our display name if it's changed
                if(user.data.name != name) {
                    userIntent.setDisplayName(name + (member.user.bot ? " [BOT]" : "") + " (Discord)").then(() => {
                        let newUser = new RemoteUser(member.user.id);

                        newUser.set("avatar", member.user.avatar);
                        newUser.set("rooms", user.data.rooms);
                        newUser.set("name", name);

                        userStore.delete({id: member.user.id }).then(() => {
                            userStore.setRemoteUser(newUser);
                        });
                    });
                }
            } else {
                // Need to create and insert the user

                let displayName = (member.nickname != null ? member.nickname : member.user.username);
                let isBot = (member.user.bot ? " [BOT]" : "");

                let user = new RemoteUser(member.user.id);
                user.set("avatar", member.user.avatar);
                user.set("rooms", [remoteRoomEntry.remote.get("channel")]);
                user.set("name", displayName);

                userStore.setRemoteUser(user).then(() => {
                    userIntent.setDisplayName(displayName + isBot + " (Discord)").then(() => {
                        if(member.user.avatarURL != null && member.user.avatarURL != "") {
                            let filename = uuidv4() + ".png";

                            util.download(member.user.avatarURL, filename, (mimetype, downloadedLocation) => {
                                self.bridge.matrixAppservice.uploadContent(fs.createReadStream(downloadedLocation), filename, mimetype).then((url) => {
                                    fs.unlinkSync(downloadedLocation); // Remove the temporary avatar file we downloaded
                                    userIntent.setAvatarUrl(url);
                                });
                            });
                        }

                        intent.invite(remoteRoomEntry.matrix.roomId, "@!discord_" + member.user.id + ":" + self.bridge.config.matrix.domain).then(() => {
                            userIntent.join(remoteRoomEntry.matrix.roomId);
                        });
                    })
                });
            }
        }).catch((err) => {
            console.error(err);
        });
    }

    public handleChannelDelete(roomNumber, channelName: string, channelId, kickMessage: string = "The Discord channel this room was bridged to was deleted.") {
        let id = channelName + ";" + roomNumber;

        let roomStore = this.getBridge().matrixAppservice.matrixBridge.getRoomStore();
        let userStore = this.getBridge().matrixAppservice.matrixBridge.getUserStore();
        let intent = this.getBridge().matrixAppservice.matrixBridge.getIntent();

        // Kick all the members in the room and then finally leave
        roomStore.getEntryById(id).then((entry) => {
            if(entry != null) {
                if(entry.matrix != null) {
                    this.getBridge().matrixAppservice.matrixBridge.getBot().getJoinedMembers(entry.matrix.roomId).then((members) => {
                        for(var member in members) {
                            if(!member.startsWith("@" + matrix.appserviceUserPart)) {
                                // Update the user store and remove the user from the channel
                                if(member.startsWith("@!discord_")) {
                                    let id = member.split(":")[0].split("_")[1];

                                    userStore.getRemoteUser(id).then((user) => {
                                        if(user != null) {
                                            let newUser = new RemoteUser(id);

                                            // Remove that channel from the rooms array
                                            let index = user.data.rooms.indexOf(channelId);
                                            if(index > -1)
                                                user.data.rooms.splice(index, 1);

                                            newUser.set("avatar", user.data.avatar);
                                            newUser.set("rooms", user.data.rooms);
                                            newUser.set("name", user.data.name);

                                            userStore.delete({id: id }).then(() => {
                                                userStore.setRemoteUser(newUser);
                                            });
                                        } else {
                                            console.error("Member is null while attempting to processes room deletion, id: " + id);
                                        }
                                    });
                                }

                                // Kick the user
                                intent.kick(entry.matrix.roomId, member, kickMessage);
                            }
                        }

                        // Leave the room after 25 seconds to allow processing of kicking
                        setTimeout(function() {
                            intent.leave(entry.matrix.roomId).then(() => {
                                console.log("Finally left room: " + id);
                            });
                        }, 25000);
                    }).catch((err) => console.error(err));
                }

                roomStore.removeEntriesByRemoteRoomId(id).then(() => {
                    console.log("Successfully removed room by id");
                }).catch((err) => console.error(err));
            }
        });
    }

    private setPresences() {
        let roomStore = self.bridge.matrixAppservice.matrixBridge.getRoomStore();

        let users = new Array();

        roomStore.getEntriesByRemoteRoomData({
            type: "discord-text"
        }).then((entries) => {
            entries.forEach((entry) => {
                if(entry.matrix != null) {
                    let guildId = entry.remote.get("guild");

                    this.client.guilds.get(guildId).members.forEach((member) => {
                        // Check if we've already updated the presence for this user
                        if(!users.includes(member.user.id)) {
                            switch(member.presence.status) {
                                case "online":
                                case "offline":
                                    this.bridge.matrixAppservice.getIntentForUser(member.user.id).getClient().setPresence(member.presence.status);
                                    break;
                                case "dnd":
                                case "idle":
                                    this.bridge.matrixAppservice.getIntentForUser(member.user.id).getClient().setPresence({
                                        presence: "unavailable",
                                        status_msg: (member.presence.status == "dnd" ? "Do not Disturb" : "Idle")
                                    });
                                    break;
                            }

                            users.push(member.user.id);
                        }
                    });
                }
            })
        })
    }
}
