const matrixSdk = require("matrix-js-sdk");
const misc = require("./misc");

const process = require("process");

var client;
function doBridgeAccount(config, mappings, typingStartCb, typingStopCb) {
    let login = matrixSdk.createClient(config.matrix.serverURL).loginWithPassword(config.matrix.bridgeAccount.userId, config.matrix.bridgeAccount.password).then((res) => {
        client = matrixSdk.createClient({
            baseUrl: config.matrix.serverURL,
            accessToken: res.access_token,
            userId: res.user_id
        });

        client.on("RoomMember.typing", (event, member) => {
            let currentTime = new Date().getTime();
            // Don't want echo for events by us
            if(member.userId === config.matrix.bridgeAccount.userId) return;

            // Check if event was in the past (matrix gives us old events when we first connect)
            // Add 2000 to adjust for latency
            if(event.getTs()+2000 < currentTime) return;

            // Check if they're a bridged user
            if(member.userId.startsWith("@discord_")) return;

            if(member.typing) {
                typingStartCb(member.roomId);
            } else {
                typingStopCb(member.roomId);
            }
        });

        client.on("RoomMember.membership", (event, member, oldMembership) => {
            let currentTime = (new Date().getTime());
            // Don't want echo for events by us
            if(member.userId === config.matrix.userId) return;
            // Check if event was in the past (matrix gives us old events when we first connect)
            // Add 2000 to adjust for latency
            //if(event.getTs()+1000 < currentTime) return;

            console.log("membership event");

            switch(event.getContent().membership) {
                case "invite":
                    if(mappings.has(member.roomId)) {
                        client.setDisplayName("Discord Bridge Service");
                        client.joinRoom(member.roomId, {syncRoom: true}, () => {});
                    }
                    break;
            }
        });

        client.startClient();

        console.log("Started matrix client.");
    }).catch((err) => {
        console.error("Error while logging in: ");
        console.error(err);
        process.exit(1);
    });
}

function sendMessage(room, message, notice = false) {
    client.sendMessage(room, notice ? misc.getNoticeFormatted(message) : misc.getTextMessageFormatted(message));
}

function sendMessageToRooms(rooms, message, notice = false) {
    for(let i = 0; i < rooms.length; i++) {
        sendMessage(rooms[i], message, notice);
    }
}

function uploadContent(stream, filename, mimetype, uploadClient = client) {
    return new Promise((resolve, reject) => {
        uploadClient.uploadContent({
            stream: stream,
            name: filename,
            type: mimetype,
            onlyContentUri: true,
            rawResponse: false
        }).then((url) => {
            resolve(JSON.parse(url).content_uri);
        }).catch((err) => {
            reject(err);
        });
    });
}

module.exports.doBridgeAccount = doBridgeAccount;
module.exports.sendMessage = sendMessage;
module.exports.uploadContent = uploadContent;
