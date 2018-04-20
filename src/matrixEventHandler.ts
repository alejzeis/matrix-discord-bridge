import { TextChannel } from "discord.js";
import { MatrixUser } from "matrix-appservice-bridge";

import { MatrixAppservice, appserviceUserPart } from "./matrix";

import { processMatrixToDiscordMessage } from "./messageHandling";
import { getMXCDownloadURL } from "./util";

export class MatrixEventHandler {
    private matrix: MatrixAppservice;

    constructor(matrix: MatrixAppservice) {
        this.matrix = matrix;
    }

    public onRoomMemberEvent(request, context) {
        let event = request.getData();

        // We don't want echo from our own bots or appservice
        if(event.state_key.startsWith("@" + appserviceUserPart)) return;
        if(event.state_key.startsWith("@!discord_")) return;
        if(event.sender.startsWith("@" + appserviceUserPart)) return;
        if(event.sender.startsWith("@!discord_")) return;

        let roomStore = this.matrix.matrixBridge.getRoomStore();
        let userStore = this.matrix.matrixBridge.getUserStore();
        let intent = this.matrix.matrixBridge.getIntent();

        switch(event.content.membership) {
            case "invite":
            case "join":
            case "leave":
            case "ban":
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
                            case "invite":
                                channel.send("***" + event.sender + "*** **invited** ***" + event.state_key + "*** **to the room**");
                                break;
                            case "join":
                                let self = this;
                                userStore.getMatrixUser(event.state_key).then((user) => {
                                    let doUpdate = false;

                                    if(user == null) {
                                        console.log("Inserting new Matrix User");
                                        let matrixUser = new MatrixUser(event.state_key);
                                        matrixUser.set("webhooks", {});
                                        matrixUser.set("webhookUser", true);
                                        matrixUser.set("avatarURL", event.content.avatar_url);
                                        matrixUser.setDisplayName(event.content.displayname);

                                        userStore.setMatrixUser(matrixUser);

                                        channel.send("***" + event.state_key + "*** **joined the room**");

                                        return;
                                    } else if(user.getDisplayName() !== event.content.displayname) {
                                        channel.send("***" + event.state_key + "*** **changed display name from** " + user.getDisplayName() + " **to** " + event.content.displayname);

                                        user.setDisplayName(event.content.displayname);

                                        // Update the webhook
                                        self.updateDiscordWebhook(channel, user.get("webhooks")[channelId], event.content.displayname, null, self.matrix.getBridge().config);

                                        doUpdate = true;
                                    }

                                    if(user.get("avatarURL") !== event.content.avatar_url) {
                                        channel.send("***" + event.state_key + "*** **changed their avatar**");

                                        user.set("avatarURL", event.content.avatar_url);

                                        // Update the webhook
                                        self.updateDiscordWebhook(channel, user.get("webhooks")[channelId], null, event.content.avatar_url, self.matrix.getBridge().config);

                                        doUpdate = true;
                                    }

                                    if(doUpdate) {
                                        // Delay this by 10 seconds as if we update the database immediately, other room events will think the name or avatar
                                        // did not change as it equals the one in the database, so wait to update the database to allow other events to process.
                                        setTimeout(function() {
                                            userStore.setMatrixUser(user);
                                        }, 10000);
                                    }
                                });
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
                break;

        }
    }

    public onRoomMessageEvent(request, context) {
        let event = request.getData();

        let roomStore = this.matrix.matrixBridge.getRoomStore();
        let userStore = this.matrix.matrixBridge.getUserStore();
        let intent = this.matrix.matrixBridge.getIntent();

        let appServiceBot = this.matrix.matrixBridge.getBot();

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

                userStore.getMatrixUser(event.sender).then((user) => {
                    if(user == null) {
                        appServiceBot.getJoinedMembers(event.room_id).then((members) => {
                            console.log("Inserting new Matrix User");
                            let matrixUser = new MatrixUser(event.sender);
                            matrixUser.set("webhooks", {});
                            matrixUser.set("webhookUser", true);
                            matrixUser.set("avatarURL", members[event.sender].avatar_url);
                            matrixUser.setDisplayName(members[event.sender].display_name);

                            userStore.setMatrixUser(matrixUser).then(() => {
                                processMatrixToDiscordMessage(event, channel, this.matrix.getBridge().config.matrix.serverURL, this.matrix);
                            });
                        });
                    } else {
                        processMatrixToDiscordMessage(event, channel, this.matrix.getBridge().config.matrix.serverURL, this.matrix);
                    }
                });
            }
        });
    }

    private handleMissingChannelMapping(entry, channelId, channelName) {
        // Delete the old webhooks for this channel from the database
        this.matrix.matrixBridge.getUserStore().getByMatrixData({
            webhookUser: true
        }).then((users: Array<any>) => {
            users.forEach((user) => {
                let userWebhooks = user.get("webhooks");
                console.log("Found user: " + user.getDisplayName());

                if(userWebhooks && Object.keys(userWebhooks).length > 0) { // Check if webhooks dictionary is empty or not
                    console.log("Not empty")
                    if(userWebhooks[channelId]) { // check if there is a webhook for the to-be-deleted channel
                        console.log("Found webhook");
                        delete userWebhooks[channelId]; // Remove that webhook entry for that channel

                        console.log("Deleted");

                        this.matrix.matrixBridge.getUserStore().setMatrixUser(user).then(() => {
                            console.log("deleted");
                        });
                    }
                }
            });
        });

        this.matrix.getBridge().discordBot.handleChannelDelete(channelId.substr(channelId.length - 4), channelName, channelId);
    }

    // Update a webhook's name and avatar
    private updateDiscordWebhook(channel: TextChannel, webhookId, name: string, mxcAvatarURL: string, bridgeConfig) {
        channel.fetchWebhooks().then((webhooks) => {
            let webhook = webhooks.get(webhookId);
            webhook.edit((name == null ? webhook.name : (name +  + " (Matrix)")), (mxcAvatarURL == null ? webhook.avatar : getMXCDownloadURL(mxcAvatarURL, bridgeConfig)));
        });
    }
}
