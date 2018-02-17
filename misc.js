const showdown = require("showdown");
const request = require("request");

const fs = require("fs");
const path = require("path");
const os = require("os");

const markdownConverter = new showdown.Converter();
var tempDir = path.join(os.tmpdir(), "matrix-discord-bridge");

try {
    fs.mkdirSync(tempDir);
} catch(e) {
    // Already exists
}

function download(url, filename, callback) {
    request.head(url, (err, res, body) => {
        let downloadedLocation = path.join(tempDir, filename)
        let contentType = res.headers['content-type'];

        request(url).pipe(fs.createWriteStream(downloadedLocation)).on('close', () => callback(contentType, downloadedLocation));
    });
}

function downloadFromMatrix(config, matrixFileUrlPart, filename, callback) {
    let uri = config.matrix.serverURL + "/_matrix/media/v1/download/" + matrixFileUrlPart;
    download(uri, filename, callback);
}

function isFileImage(filename) {
    let ext = path.extname(filename).toLowerCase();
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

function isFileVideo(filename) {
    let ext = path.extname(filename).toLowerCase();
    switch(ext) {
        case ".mpg":
        case ".mp2":
        case ".mp4":
        case ".mpeg":
        case ".mpv":
        case ".mov":
        case ".wmv":
            return true;
        default:
            return false;
    }
}

function isFileAudio(filename) {
    let ext = path.extname(filename).toLowerCase();
    switch(ext) {
        case ".mp3":
        case ".mpa":
        case ".aac":
        case ".ogg":
        case ".opus":
        case ".flac":
        case ".wav":
        case ".wma":
            return true;
        default:
            return false;
    }
}

function getMediaUploadContent(attachment, url, mimetype) {
    let content = {
        msgtype: "m.file",
        body: attachment.filename,
        filename: attachment.filename,
        url: url,
        info: {
            size: attachment.size,
            mimetype: mimetype
        }
    };

    if(isFileImage(attachment.filename)) {
        content.msgtype = "m.image";
        content.info.w = attachment.width;
        content.info.h = attachment.height;
    } else if(isFileAudio(attachment.filename)) {
        content.msgtype = "m.audio";
        // TODO: duration
    } else if(isFileVideo(attachment.filename)) {
        content.msgtype = "m.video";
    }

    return content;
}

function getTextMessageFormatted(text) {
    return {
        body: text,
        msgtype: "m.text",
        formatted_body: markdownConverter.makeHtml(text),
        format: "org.matrix.custom.html"
    };
}

function getNoticeFormatted(text) {
    return {
        body: text,
        msgtype: "m.notice",
        formatted_body: markdownConverter.makeHtml(text),
        format: "org.matrix.custom.html"
    };
}

function intentSendMessageToRooms(intent, rooms, message) {
    for(let i = 0; i < rooms.length; i++) {
        intent.sendMessage(rooms[i], message);
    }
}

function getMatrixRoomsForMember(Discord, member, discordMappings, guildMappings) {
    // Get the list of all matrix rooms this person is in
    let allRooms = [];
    let channels = guildMappings.get(member.guild.id);
    for(let i = 0; i < channels.length; i++) {
        if(member.permissionsIn(channels[i]).has(Discord.Permissions.FLAGS.VIEW_CHANNEL)) {
            allRooms.push(discordMappings.get(channels[i]));
        }
    }
    return allRooms;
}

module.exports.download = download;
module.exports.downloadFromMatrix = downloadFromMatrix;
module.exports.isFileImage = isFileImage;
module.exports.getMediaUploadContent = getMediaUploadContent;
module.exports.getTextMessageFormatted = getTextMessageFormatted;
module.exports.getNoticeFormatted = getNoticeFormatted;
module.exports.intentSendMessageToRooms = intentSendMessageToRooms;
module.exports.getMatrixRoomsForMember = getMatrixRoomsForMember;
