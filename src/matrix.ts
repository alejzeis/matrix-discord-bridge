import { Cli, Bridge, AppServiceRegistration } from "matrix-appservice-bridge";

import { DiscordMatrixBridge } from "./main";

import { join } from "path";

const appserviceUserPart = "appservice-discord";

var self;

export class MatrixAppservice {
    private bridge: DiscordMatrixBridge;
    private cli: Cli;
    private _matrixBridge: Bridge;

    private registrationLocation: string;

    get matrixBridge(): Bridge { return this._matrixBridge; }

    constructor(bridge: DiscordMatrixBridge) {
        this.bridge = bridge;

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
                onEvent: self.onEvent
            }
        });

        console.log("Matrix AppService running on port %s", port);
        self.matrixBridge.run(port, cfg);
    }

    public run() {
        this.cli.run();
    }

    private onUserQuery(queriedUser): object {
        return {};
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

                resolve({
                    creationOpts: {
                        room_alias_name: aliasLocalpart,
                        name: "#" + value.data.name + " (" + value.data.guild + ") [Discord]",
                        topic: value.data.topic,
                        visibility: value.data.visibility,
                        preset: value.data.matrixPreset
                    },
                    remote: value
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
                if(event.sender == self.bridge.config.matrix.bridgeAccount.userId) return;
        }
    }
}
