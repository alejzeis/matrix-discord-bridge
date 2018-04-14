import { Cli, Bridge, AppServiceRegistration } from "matrix-appservice-bridge";

import { DiscordMatrixBridge } from "./main";
import { MatrixEventHandler } from "./matrixEventHandler";

import { join } from "path";

export const appserviceUserPart = "appservice-discord";

var self: MatrixAppservice;

export class MatrixAppservice {
    private bridge: DiscordMatrixBridge;
    private cli: Cli;
    private _matrixBridge: Bridge;

    private eventHandler: MatrixEventHandler;

    private registrationLocation: string;

    get matrixBridge(): Bridge { return this._matrixBridge; }
    getBridge(): DiscordMatrixBridge { return this.bridge; }

    constructor(bridge: DiscordMatrixBridge) {
        this.bridge = bridge;
        this.eventHandler = new MatrixEventHandler(this);

        this.registrationLocation = join(this.bridge.configurationDir, "appservice-registration.yml");

        self = this;
        this.cli = new Cli({
            registrationPath: self.registrationLocation,
            generateRegistration: self.generateRegistration,
            run: self.cliRun
        });
    }

    private generateRegistration(reg, callback) {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart(appserviceUserPart);
        reg.addRegexPattern("users", "@!discord_.*", true);
        reg.addRegexPattern("aliases", "#!discord_.*", true);
        callback(reg);
    }

    private cliRun(port, cfg) {
        self._matrixBridge = new Bridge({
            homeserverUrl: self.bridge.config.matrix.serverURL,
            domain: self.bridge.config.matrix.domain,
            registration: self.registrationLocation,

            controller: {
                onUserQuery: self.onUserQuery,
                onAliasQuery: self.onAliasQuery,
                onAliasQueried: self.onAliasQueried,
                onEvent: self.onEvent.bind(self)
            }
        });

        console.log("Matrix AppService running on port %s", port);
        self.matrixBridge.run(port, cfg);
    }

    public run() {
        this.cli.run();
    }

    public getIntentForUser(user: string) {
        return this.matrixBridge.getIntent("@!discord_" + user + ":" + this.bridge.config.matrix.domain);
    }

    public uploadContent(readStream, filename: string, mimetype: string): Promise<string> {
        return new Promise((resolve, reject) => {
            self.matrixBridge.getIntent().getClient().uploadContent({
                stream: readStream,
                name: filename,
                type: mimetype,
                onlyContentUri: true,
                rawResponse: false
            }).then((url) => {
                resolve(JSON.parse(url).content_uri);
            }).catch((err) => {
                reject(err);
            });
        })
    }

    public getMatrixRoomIdFromDiscordInfo(guildId, channelId): Promise<string> {
        let roomStore = self.matrixBridge.getRoomStore();

        return new Promise((resolve, reject) => {
            roomStore.getEntriesByRemoteRoomData({
                guild: guildId,
                channel: channelId
            }).then((entries) => {
                if(entries.length < 1) {
                    reject(new Error("Couldn't find entries for that guild ID and channel ID"));
                    return;
                }

                resolve(entries[0].matrix.roomId);
            }).catch((e) => reject(e));
        });
    }

    private onUserQuery(matrixUser): object {
        return {};
    }

    private onAliasQueried(alias, roomId) {
        let discordRoom = alias.split(":")[0].split("_")[1].replace("#!", "").replace("#", "");
        console.log("Alias queried " + alias + ", discord room: " + discordRoom);

        let intent = self.matrixBridge.getIntent();
        let roomStore = self.matrixBridge.getRoomStore();

        return new Promise((resolve, reject) => {
            roomStore.getEntriesByRemoteId(discordRoom).then((values) => {
                let entry = values[0];

                roomStore.delete({ id: entry.id }).then(() => {
                    entry.id = discordRoom;

                    roomStore.upsertEntry(entry).then(() => {
                        self.bridge.discordBot.setupNewProvisionedRoom(discordRoom);
                    });
                })
            });
        });
    }

    private onAliasQuery(alias, aliasLocalpart): Promise<object> {
        let discordRoom = aliasLocalpart.split("_")[1].replace("#", "");
        console.log("Processing alias for " + alias + " (" + aliasLocalpart + ")" + ", discord room is: " + discordRoom);

        let intent = self.matrixBridge.getIntent();
        let roomStore = self.matrixBridge.getRoomStore();

        return new Promise((resolve, reject) => {
            roomStore.getEntriesByRemoteId(discordRoom).then((values) => {
                if(values == null || values.length == 0) {
                    console.error("Failed to find discordRoom matching: " + discordRoom);
                    reject();
                    return;
                }

                let value = values[0];

                console.log(value);

                roomStore.removeEntriesByRemoteRoomId(discordRoom).then(() => {
                    resolve({
                        creationOpts: {
                            room_alias_name: aliasLocalpart,
                            name: "#" + value.data.name + " (" + value.data.guild + ") [Discord]",
                            topic: value.data.topic == null ? "Bridged Discord Room" : value.data.topic,
                            visibility: value.data.visibility,
                            preset: value.data.matrixPreset
                        },
                        remote: value.remote
                    });
                });
            });
        });
    }

    private onEvent(request, context) {
        let event = request.getData();
        console.log(event.type);

        switch(event.type) {
            case "m.room.member":
                if(event.age >= 5000) return;
                if(event.sender == this.bridge.config.matrix.bridgeAccount.userId) return;

                this.eventHandler.onRoomMemberEvent(request, context);
                break;
            case "m.room.message":
                if(event.age >= 5000) return;
                if(event.sender == this.bridge.config.matrix.bridgeAccount.userId) return;

                this.eventHandler.onRoomMessageEvent(request, context);
                break;
        }
    }
}
