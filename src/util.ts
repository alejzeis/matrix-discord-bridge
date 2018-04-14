import * as request from "request";
import * as mm from "musicmetadata";

import { tmpdir } from "os";
import { join, extname } from "path";
import { mkdirSync, createWriteStream } from "fs";

var tempDir = join(tmpdir(), "matrix-discord-bridge");

try {
    mkdirSync(tempDir);
} catch(e) {
    // Already exists
}

export enum MatrixFileType {
    FILE,
    IMAGE,
    VIDEO,
    AUDIO
}

export function download(url: string, filename: string, callback: (contentType: string, downloadedLocation: string) => any) {
    request.head(url, (err, res, body) => {
        let downloadedLocation = join(tempDir, filename)
        let contentType = res.headers['content-type'];

        request(url).pipe(createWriteStream(downloadedLocation)).on('close', () => callback(contentType, downloadedLocation));
    });
}

export function uploadMatrix(stream, filename: string, mimetype: string, client): Promise<string> {
    return new Promise((resolve, reject) => {
        client.uploadContent({
            stream: stream,
            name: filename,
            type: mimetype,
            onlyContentUri: true,
            rawResponse: false
        }).then((url) => {
            resolve(JSON.parse(url).content_uri);
        }).catch((err) => reject(err));
    });
}

export function determineFileMatrixType(filename: string): MatrixFileType {
    let ext = extname(filename).toLowerCase();
    switch(ext) {
        case ".png":
        case ".jpg":
        case ".jpeg":
        case ".gifv":
        case ".gif":
        case ".bmp":
        case ".svg":
            return MatrixFileType.IMAGE;
        case ".mpg":
        case ".mp2":
        case ".mp4":
        case ".mpeg":
        case ".mpv":
        case ".mov":
        case ".wmv":
            return MatrixFileType.VIDEO;
        case ".mp3":
        case ".m4a":
        case ".mpa":
        case ".aac":
        case ".ogg":
        case ".opus":
        case ".flac":
        case ".wav":
        case ".wma":
            return MatrixFileType.AUDIO;
        default:
            return MatrixFileType.FILE;
    }
}

export function determineAudioFileDuration(stream): Promise<number> {
    return new Promise((resolve, reject) => {
        mm(stream, (err, metadata) => {
            stream.close();
            if(err) reject(err);
            else {
                resolve(metadata.duration);
            }
        });
    });
}
