import * as Discord from "discord.js";
import { RemoteRoom } from "matrix-appservice-bridge";

import { DiscordMatrixBridge } from "./main";

var self: DiscordBot;
export class DiscordBot {
    private bridge: DiscordMatrixBridge;
    private client: Discord.Client;

    constructor(bridge: DiscordMatrixBridge) {
        this.bridge = bridge;
        this.client = new Discord.Client();

        this.client.on("ready", this.onReady);

        self = this;
    }

    public run() {
        this.client.login(this.bridge.config.discord.token);
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
                        self.tryInsertNewRemoteRoom(self, channel.id.substr(channel.id.length - 4), guild, channel, canInvite, canAccess);

                        /*console.log("Creating room for #" + channel.name);
                        intent.createRoom({
                            createAsClient: false,
                            options: {
                                preset: canInvite ? "public_chat" : "private_chat",
                                name: channel.name,
                                topic: channel.topic,
                                visibility: canInvite ? "public" : "private",
                                room_alias_name: "discord_!" + channel.id
                            }
                        });
                        intent.leave()*/
                    }
                }
            });
        });
    }

    private tryInsertNewRemoteRoom(self: DiscordBot, roomNumber, guild: Discord.Guild, channel: Discord.TextChannel, canInvite: boolean, canAccess: boolean) {
        let intent = self.bridge.matrixAppservice.matrixBridge.getIntent();
        let roomStore = self.bridge.matrixAppservice.matrixBridge.getRoomStore();

        let roomId = channel.name + ";" + roomNumber;
        roomStore.getEntryById(roomId).then((entry) => {
            console.log("Entry for (" + roomId + "): " + entry);
            if(entry == null) {
                console.log("Creating entry and inserting.");
                let room = new RemoteRoom(roomId);
                room.set("type", "discord-text");
                room.set("guild", guild.id);
                room.set("channel", channel.id);
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
                });
            } else {
                // Check if it matches our guild and channel
                if(entry.remote.get("guild") == guild.id && entry.remote.get("channel") == channel.id) return;

                // Create a new room as it didn't match our guild and channel, so it's a different discord room we found.
                self.tryInsertNewRemoteRoom(self, roomNumber - 1, guild, channel, canInvite, canAccess);
            }
        });
    }
}
