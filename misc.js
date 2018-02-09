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

function getFileOrImageUploadContent(attachment, url, mimetype) {
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

module.exports.download = download;
module.exports.downloadFromMatrix = downloadFromMatrix;
module.exports.isFileImage = isFileImage;
module.exports.getFileOrImageUploadContent = getFileOrImageUploadContent;
module.exports.getTextMessageFormatted = getTextMessageFormatted;
module.exports.getNoticeFormatted = getNoticeFormatted;
