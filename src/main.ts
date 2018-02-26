import * as fs from "fs";
import * as path from "path";

import { loadConfig, BridgeConfig, MatrixConfig, DiscordConfig } from "./config";
import { MatrixAppservice } from "./matrix";
import { DiscordBot } from "./discord";

export class DiscordMatrixBridge {
    private _tmpDir: string;
    private _configurationDir: string;

    private _config: BridgeConfig;

    private _matrixAppservice: MatrixAppservice;
    private _discordBot: DiscordBot;

    get tmpDir(): string { return this._tmpDir; }
    get configurationDir(): string { return this._configurationDir; }
    get config(): BridgeConfig { return this._config; }

    get matrixAppservice(): MatrixAppservice { return this._matrixAppservice; }
    get discordBot(): DiscordBot { return this._discordBot; }

    constructor(tmpDir: string, configurationDir: string) {
        this._tmpDir = tmpDir;
        try {
            fs.mkdirSync(tmpDir);
        } catch(e) {} // Already exists

        this._configurationDir = configurationDir;
        this._config = loadConfig(path.join(configurationDir, "bridgeConfig.yml"));

        this._matrixAppservice = new MatrixAppservice(this);
        this._discordBot = new DiscordBot(this);
    }

    public run() {
        this.matrixAppservice.run();
        this.discordBot.run();
    }
}

import { tmpdir } from "os";
let bridge = new DiscordMatrixBridge(tmpdir(), "./cfg");
bridge.run();
