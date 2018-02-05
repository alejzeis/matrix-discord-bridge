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

function sendTextMessageFormatted(client, room, text) {
    return new Promise((resolve, reject) => {
        client.sendMessage(room, {
            body: text,
            msgtype: "m.text",
            formatted_body: markdownConverter.makeHtml(text),
            format: "org.matrix.custom.html"
        }).done(() => resolve());
    });
}

function sendNoticeFormatted(client, room, text) {
    return new Promise((resolve, reject) => {
        client.sendMessage(room, {
            body: text,
            msgtype: "m.notice",
            formatted_body: markdownConverter.makeHtml(text),
            format: "org.matrix.custom.html"
        }).done(() => resolve());
    });
}

module.exports.download = download;
module.exports.downloadFromMatrix = downloadFromMatrix;
module.exports.isFileImage = isFileImage;
module.exports.sendTextMessageFormatted = sendTextMessageFormatted;
module.exports.sendNoticeFormatted = sendNoticeFormatted;
