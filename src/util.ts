import * as request from "request";

import { join } from "path";
import { tmpdir } from "os";
import { mkdirSync, createWriteStream } from "fs";

var tempDir = join(tmpdir(), "matrix-discord-bridge");

try {
    mkdirSync(tempDir);
} catch(e) {
    // Already exists
}

export function download(url: string, filename: string, callback: (contentType: string, downloadedLocation: string) => any) {
    request.head(url, (err, res, body) => {
        let downloadedLocation = join(tempDir, filename)
        let contentType = res.headers['content-type'];

        request(url).pipe(createWriteStream(downloadedLocation)).on('close', () => callback(contentType, downloadedLocation));
    });
}
