import * as Discord from "discord.js";

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
        let intent = self.bridge.matrixAppservice.matrixBridge.getIntent();
        
        self.client.guilds.forEach((guild) => {
            guild.channels.forEach((channel) => {
                if(channel instanceof Discord.TextChannel) {
                    let permissions = channel.permissionsFor(self.client.user);
                    let canAccess = permissions.has(Discord.Permissions.FLAGS.VIEW_CHANNEL);
                    let canInvite = permissions.has(Discord.Permissions.FLAGS.CREATE_INSTANT_INVITE);

                    if(canAccess) {
                        intent.createRoom({
                            createAsClient: false,
                            options: {
                                preset: canInvite ? "public_chat" : "private_chat",
                                name: channel.name,
                                topic: channel.topic,
                                visibility: canInvite ? "public" : "private",
                                room_alias_name: "discord_#" + channel.name
                            }
                        });
                    }
                }
            });
        });
    }
}
