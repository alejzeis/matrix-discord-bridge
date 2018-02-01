// Imports -----------------------------------------------------------------------------------------------------------------
const Discord = require("discord.js");
const matrixSdk = require("matrix-js-sdk");
const YAML = require("yamljs");
const request = require("request");

const os = require("os");
const fs = require("fs");
const path = require("path");
const process = require("process");

// Config and functions -----------------------------------------------------------------------------------------------------------------
const defaultConfig = {
    discord: {
        token: "",
        guild: 0,
        channel: 0
    },
    matrix: {
        serverURL: "https://matrix.org",
        accessToken: "",
        userId: "@example:matrix.org",
        rooms: []
    }
};
var config;
var tempDir = path.join(os.tmpdir(), "matrix-discord-bridge");

function download(url, filename, callback) {
    request.head(url, (err, res, body) => {
        let downloadedLocation = path.join(tempDir, filename)
        let contentType = res.headers['content-type'];

        request(url).pipe(fs.createWriteStream(downloadedLocation)).on('close', () => callback(contentType, downloadedLocation));
    });
}

function downloadFromMatrix(matrixFileUrlPart, filename, callback) {
    let uri = config.matrix.serverURL + "/_matrix/media/v1/download/" + matrixFileUrlPart;
    download(uri, filename, callback);
}

function isFileImage(filename) {
    let ext = path.extname(filename);
    switch(ext) {
        case ".png":
        case ".jpg":
        case ".jpeg":
        case ".gifv":
        case ".gif":
        case ".bmp":
        case ".svg":
            return true;
        default:
            return false;
    }
}

// Program Main ----------------------------------------------------------------------------------------------------------------------------


try {
    fs.mkdirSync(tempDir);
} catch(e) {
    // Already exists
}

try {
    config = YAML.load("bridgeBot.yml");
} catch(e) {
    console.error("Could not load bridgeBot.yml, perhaps it doesn't exist? Creating it...");
    fs.writeFileSync("bridgeBot.yml", YAML.stringify(defaultConfig, 4));
    console.error("Configuration file created. Please fill out the fields and then run the bot again.")
    process.exit(1);
}


const discordClient = new Discord.Client();
const matrixClient = matrixSdk.createClient({
    baseUrl: config.matrix.serverURL,
    accessToken: config.matrix.accessToken,
    userId: config.matrix.userId
});
var discordGuild;
var discordChannel;

var amountTypingOnDiscord = 0
var amountTypingOnMatrix = 0;

discordClient.on("ready", () => {
    console.log("Discord Client Ready.");
    discordGuild = discordClient.guilds.get(config.discord.guild);
    discordChannel = discordGuild.channels.get(config.discord.channel);
});

discordClient.on("channelPinsUpdate", (channel, time) => {
    matrixClient.sendNotice(config.matrix.room, "Someone pinned/unpinned a new message in the channel.");
});

discordClient.on("guildMemberAdd", (member) => {
    matrixClient.sendNotice(config.matrix.room, member.user.username + " has joined the server.");
});

discordClient.on("guildMemberRemove", (member) => {
    matrixClient.sendNotice(config.matrix.room, member.user.username + " has left the server.");
});

discordClient.on("guildMemberUpdate", (oldMember, newMember) => {
    if(oldMember.nickname !== newMember.nickname) {
        matrixClient.sendNotice(config.matrix.room, oldMember.user.username + " has changed their nickname to " + newMember.nickname);
    }
});

discordClient.on("presenceUpdate", (oldMember, newMember) => {
    let author = oldMember.nickname == null ? oldMember.user.username : oldMember.nickname;

    if(oldMember.presence.status !== newMember.presence.status) {
        matrixClient.sendNotice(config.matrix.room, author + " is now " + (newMember.presence.status == "dnd" ? "on Do Not Disturb" : newMember.presence.status));
    }

    if(oldMember.presence.game == null && newMember.presence.game != null) {
        matrixClient.sendNotice(config.matrix.room, author + " is now playing " + newMember.presence.game.name);
        if(newMember.presence.game.streaming) {
            matrixClient.sendNotice(config.matrix.room, author + " is streaming at " + newMember.presence.game.url);
        }
    }

    if(oldMember.presence.game != null && newMember.presence.game == null) {
        matrixClient.sendNotice(config.matrix.room, author + " has stopped playing " + oldMember.presence.game.name);
    }

    if(oldMember.presence.game != null && newMember.presence.game != null) {
        if(oldMember.presence.game.streaming && !newMember.presence.game.streaming) {
            matrixClient.sendNotice(config.matrix.room, author + " has stopped streaming");
        } else if(!oldMember.presence.game.streaming && newMember.presence.game.streaming){
            matrixClient.sendNotice(config.matrix.room, author + " has started streaming at " + newMember.presence.game.url);
        }
    }
});

discordClient.on("guildBanAdd", (guild, user) => {
    if(guild.id != config.discord.guild) return;

    matrixClient.sendNotice(config.matrix.room, user.username + " was banned.");
});

discordClient.on("guildBanRemove", (guild, user) => {
    if(guild.id != config.discord.guild) return;

    matrixClient.sendNotice(config.matrix.room, user.username + " was unbanned.");
});

discordClient.on("guildUnavailable", (guild) => {
    if(guild.id == config.discord.guild) {
        matrixClient.sendTextMessage(config.matrix.room, "WARNING: The guild I'm bridging to is unavailable, probably due to a server outage.");
    }
});

discordClient.on("reconnecting", () => {
    matrixClient.sendNotice(config.matrix.room, "BOT: Reconnecting to discord...");
});

discordClient.on("message", message => {
    if(message.author.username === config.discord.username) return;
    if(message.channel.id !== config.discord.channel) return;
    if((message.content == null || message.content == "") && message.attachments.size == 0) return;

    let author = message.member.nickname == null ? message.author.username : message.member.nickname;

    if(message.attachments.size > 0) {
        let attachment = message.attachments.values().next().value;
        download(attachment.url, attachment.filename, (mimetype, downloadedLocation) => {
            matrixClient.uploadContent({
                stream: fs.createReadStream(downloadedLocation),
                name: attachment.filename,
                type: mimetype,
                onlyContentUri: true,
                rawResponse: false
            }).done((url) => {
                let size = attachment.filesize;
                let content = {
                    msgtype: "m.file",
                    body: attachment.filename,
                    filename: attachment.filename,
                    url: JSON.parse(url).content_uri,
                    info: {
                        size: size,
                        mimetype: mimetype
                    }
                };
                if(isFileImage(attachment.filename)) {
                    content.msgtype = "m.image";
                    content.info.w = attachment.width;
                    content.info.h = attachment.height;
                }

                matrixClient.sendTextMessage(config.matrix.room, author + (isFileImage(attachment.filename) ? " sent an image:" : " uploaded a file:")).done(() => {
                    matrixClient.sendMessage(config.matrix.room, content).done(() => fs.unlinkSync(downloadedLocation));
                });
            });
        });
    } else {
        matrixClient.sendTextMessage(config.matrix.room, author + ": " + message.cleanContent);
    }
});

discordClient.on("typingStart", (channel, user) => {
    if(user.username === config.discord.username) return;
    if(channel.id !== config.discord.channel) return;

    if(amountTypingOnDiscord > 0) {
        amountTypingOnDiscord++;
        return;
    }

    matrixClient.sendTyping(config.matrix.room, true, 60000);
    amountTypingOnDiscord++;
});

discordClient.on("typingStop", (channel, user) => {
    if(channel.id !== config.discord.channel) return;

    amountTypingOnDiscord--;
    if(amountTypingOnDiscord <= 0) {
        matrixClient.sendTyping(config.matrix.room, false, 0);
        amountTypingOnDiscord = 0;
    }
});

matrixClient.on("Room.timeline", (event, room, startOfTimeline) => {
    let currentTime = (new Date().getTime());
    if(startOfTimeline) return;
    if(event.getType() !== "m.room.message") {
        console.log("Event type: " + event.getType());
        return;
    }

    if(event.getSender() === config.matrix.userId) return;
    // Check if event was in the past (matrix gives us old events when we first connect)
    // Add 2000 to adjust for latency
    if(event.getTs()+2000 < currentTime) return;

    //console.log(event.getContent());
    switch(event.getContent().msgtype) {
        case "m.image":
            // Check if file size is greater than 8 MB, discord does not allow files greater than 8 MB
            if(event.getContent().info.size >= (1024*1024*8)) {
                // File is too big, send link then
                discordChannel.send("**" + event.getSender() + "**: ***Sent an image:*** " + config.matrix.serverURL + "/_matrix/media/v1/download/" + event.getContent().url.replace("mxc://", ""));
            } else {
                downloadFromMatrix(event.getContent().url.replace("mxc://", ""), event.getContent().body, (mimeType, downloadedLocation) => {
                    discordChannel.send("**" + event.getSender() + "**: ***Sent an image:*** *" + event.getContent().body + "*", new Discord.Attachment(downloadedLocation, event.getContent().body))
                        .then(() => fs.unlinkSync(downloadedLocation));
                        // Delete the image we downloaded after we uploaded it
                });
            }
            break;
        case "m.file":
            // Check if file size is greater than 8 MB, discord does not allow files greater than 8 MB
            if(event.getContent().info.size >= (1024*1024*8)) {
                // File is too big, send link then
                discordChannel.send("**" + event.getSender() + "**: ***Uploaded a file:*** " + config.matrix.serverURL + "/_matrix/media/v1/download/" + event.getContent().url.replace("mxc://", ""));
            } else {
                downloadFromMatrix(event.getContent().url.replace("mxc://", ""), event.getContent().body, (mimeType, downloadedLocation) => {
                    discordChannel.send("**" + event.getSender() + "**: ***Uploaded a file:*** *" + event.getContent().body + "*", new Discord.Attachment(downloadedLocation, event.getContent().body))
                        .then(() => fs.unlinkSync(downloadedLocation));
                        // Delete the file we downloaded after we uploaded it
                });
            }
            break;
        case "m.text":
        default:
            discordChannel.send("**" + event.getSender() + "**: " + event.getContent().body);
            break;

    }

    matrixClient.sendReceipt(event, "m.read");
    console.log(event.getTs() + " || " + room.name + " | " + event.getSender() + " " + event.getContent().body);
});

matrixClient.on("RoomMember.typing", (event, member) => {
    let currentTime = (new Date().getTime());
    if(member.userId === config.matrix.userId) return;
    // Check if event was in the past (matrix gives us old events when we first connect)
    // Add 2000 to adjust for latency
    if(event.getTs()+2000 < currentTime) return;

    if(member.typing) {
        if(amountTypingOnMatrix > 0) {
            amountTypingOnMatrix++;
            return;
        }

        discordChannel.startTyping();
        amountTypingOnMatrix++;
    } else {
        amountTypingOnMatrix--;

        if(amountTypingOnMatrix <= 0) {
            discordChannel.stopTyping();
            amountTypingOnMatrix = 0;
        }
    }
});

matrixClient.on("RoomMember.membership", (event, member, oldMembership) => {
    let currentTime = (new Date().getTime());
    if(member.userId === config.matrix.userId) return;
    // Check if event was in the past (matrix gives us old events when we first connect)
    // Add 2000 to adjust for latency
    if(event.getTs()+2000 < currentTime) return;

    switch(event.getContent().membership) {
        case "invite":
            discordChannel.send("***" + event.target.userId + "*** **has been invited by** ***" + event.getSender() + "*** **to the room**");
            break;
        case "join":
            discordChannel.send("***" + event.getSender() + "*** **has joined the room**");
            break;
        case "leave":
            discordChannel.send("***" + event.getSender() + "*** **has left the room**");
            break;
        case "ban":
            discordChannel.send("***" + event.target.userId + "*** **has been banned by** ***" + event.getSender() +"*** from the room**");
            break;
    }
});

discordClient.login(config.discord.token);
matrixClient.startClient();
console.log("Matrix client started.");
