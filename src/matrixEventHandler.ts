import { TextChannel } from "discord.js";
import { MatrixAppservice, appserviceUserPart } from "./matrix";

import { processMatrixToDiscordMessage } from "./messageHandling";

export class MatrixEventHandler {
    private matrix: MatrixAppservice;

    constructor(matrix: MatrixAppservice) {
        this.matrix = matrix;
    }

    public onRoomMemberEvent(request, context) {
        let event = request.getData();

        let roomStore = this.matrix.matrixBridge.getRoomStore();
        let intent = this.matrix.matrixBridge.getIntent();

        switch(event.content.membership) {
            case "invite":
                //TODO
                break;
            case "join":
            case "leave":
            case "ban":
                if(event.state_key.startsWith("@" + appserviceUserPart)) return;
                if(event.state_key.startsWith("@!discord_")) return;

                roomStore.getEntriesByMatrixId(event.room_id).then((entries) => {
                    if(entries.length > 0) {
                        let entry = entries[0];
                        if(entry.remote.get("type") != "discord-text") return;

                        let guildId = entry.remote.get("guild");
                        let channelId = entry.remote.get("channel");

                        let channel = this.matrix.getBridge().discordBot.getChannel(guildId, channelId) as TextChannel;
                        if(channel == null) {
                            this.handleMissingChannelMapping(entry, channelId, entry.remote.get("name"));
                            return;
                        }

                        switch(event.content.membership) {
                            case "join":
                                channel.send("***" + event.state_key + "*** **joined the room**");
                                break;
                            case "leave":
                                channel.send("***" + event.state_key + "*** **left the room**");
                                break;
                            case "ban":
                                channel.send("***" + event.state_key + "*** **banned from room by** ***" + event.sender + "***");
                                break;
                        }
                    } else {
                        // No entries found, the room might be scheduled for deletion
                        intent.kick(event.room_id, event.state_key, "The Discord channel this room is bridged to is being deleted!");
                    }
                });

        }
    }

    public onRoomMessageEvent(request, context) {
        let event = request.getData();

        let roomStore = this.matrix.matrixBridge.getRoomStore();
        let intent = this.matrix.matrixBridge.getIntent();

        roomStore.getEntriesByMatrixId(event.room_id).then((entries) => {
            if(entries.length > 0) {
                let entry = entries[0];
                if(entry.remote.get("type") != "discord-text") return;

                let guildId = entry.remote.get("guild");
                let channelId = entry.remote.get("channel");

                let channel = this.matrix.getBridge().discordBot.getChannel(guildId, channelId) as TextChannel;
                if(channel == null) {
                    this.handleMissingChannelMapping(entry, channelId, entry.remote.get("name"));
                    return;
                }

                processMatrixToDiscordMessage(event, channel, this.matrix.getBridge().config.matrix.serverURL);
            }
        });
    }

    private handleMissingChannelMapping(entry, channelId, channelName) {
        this.matrix.getBridge().discordBot.handleChannelDelete(channelId.substr(channelId.length - 4), channelName, channelId);
    }
}
