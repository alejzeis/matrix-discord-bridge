import * as Discord from "discord.js";

import * as matrix from "./matrix";

import { DiscordBot } from "./discord";
import { RemoteUser } from "matrix-appservice-bridge";

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
            let id = channel.name + ";" + roomNumber;

            let roomStore = this.discordBot.getBridge().matrixAppservice.matrixBridge.getRoomStore();
            let userStore = this.discordBot.getBridge().matrixAppservice.matrixBridge.getUserStore();
            let intent = this.discordBot.getBridge().matrixAppservice.matrixBridge.getIntent();

            // Update the user store and remove each user from the channel
            channel.members.forEach((member) => {
                userStore.getRemoteUser(member.user.id).then((user) => {
                    if(user != null) {
                        let newUser = new RemoteUser(member.user.id);

                        // Remove that channel from the rooms array
                        let index = user.data.rooms.indexOf(channel.id);
                        if(index > -1)
                            user.data.rooms.splice(index, 1);

                        newUser.set("avatar", user.data.avatar);
                        newUser.set("rooms", user.data.rooms);
                        newUser.set("name", user.data.name);

                        userStore.delete({id: member.user.id }).then(() => {
                            userStore.setRemoteUser(newUser);
                        });
                    }
                });
            });

            // Kick all the members in the room and then finally leave 
            roomStore.getEntryById(id).then((entry) => {
                if(entry != null) {
                    console.log("Found entry for " + id);
                    if(entry.matrix != null) {
                        this.discordBot.getBridge().matrixAppservice.matrixBridge.getBot().getJoinedMembers(entry.matrix.roomId).then((members) => {
                            for(var member in members) {
                                if(!member.startsWith("@" + matrix.appserviceUserPart)) {
                                    intent.kick(entry.matrix.roomId, member, "The Discord channel this room was bridged to was deleted.");
                                }
                            }

                            setTimeout(function() {
                                intent.leave(entry.matrix.roomId).then(() => {
                                    console.log("Finally left room: " + id);
                                });
                            }, 20000);
                        }).catch((err) => console.error(err));
                    }

                    roomStore.removeEntriesByRemoteRoomId(id).then(() => {
                        console.log("Successfully removed room by id");
                    }).catch((err) => console.error(err));
                }
            });
        }
    }
}
