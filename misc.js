const showdown = require("showdown");
const markdownConverter = new showdown.Converter();

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
module.exports.getTextMessageFormatted = getTextMessageFormatted;
module.exports.getNoticeFormatted = getNoticeFormatted;
