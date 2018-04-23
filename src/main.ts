import * as fs from "fs";
import * as path from "path";

import { loadConfig, BridgeConfig, MatrixConfig, DiscordConfig } from "./config";
import { MatrixAppservice } from "./matrix";
import { DiscordBot } from "./discord";

import * as winston from "winston";
import * as winstonError from "winston-error";
require("winston-daily-rotate-file");

import * as dateFormat from "dateformat";

export class DiscordMatrixBridge {
    private _tmpDir: string;
    private _configurationDir: string;

    private _config: BridgeConfig;

    private _matrixAppservice: MatrixAppservice;
    private _discordBot: DiscordBot;

    private _logger: winston.LoggerInstance;

    get tmpDir(): string { return this._tmpDir; }
    get configurationDir(): string { return this._configurationDir; }
    get config(): BridgeConfig { return this._config; }

    get matrixAppservice(): MatrixAppservice { return this._matrixAppservice; }
    get discordBot(): DiscordBot { return this._discordBot; }

    get logger(): winston.LoggerInstance { return this._logger; }

    constructor(tmpDir: string, configurationDir: string) {
        this._tmpDir = tmpDir;
        try {
            fs.mkdirSync(tmpDir);
        } catch(e) {} // Already exists

        this._logger = new winston.Logger({
            transports: [
                new winston.transports.Console({
                    level: process.env.LOG_LEVEL != null ? process.env.LOG_LEVEL : "info",
                    timestamp: function() {
                        return dateFormat(new Date(), "[yyyy-mm-dd HH:MM:ss]");
                    }
                }),
                new winston.transports.DailyRotateFile({
                    level: process.env.LOG_LEVEL != null ? process.env.LOG_LEVEL : "info",
                    filename: "bridge-%DATE%.log",
                    datePattern: "DD",
                    zippedArchive: true,
                    dirname: "logs",
                    maxsize: "20m",
                    maxFiles: "14d"
                })
            ]
        });
        winstonError(this._logger);

        this._configurationDir = configurationDir;
        this._config = loadConfig(path.join(configurationDir, "bridgeConfig.yml"), this.logger);

        this._matrixAppservice = new MatrixAppservice(this);
        this._discordBot = new DiscordBot(this);
    }

    public run() {
        this.logger.info("Starting Matrix-Discord bridge...");

        this.matrixAppservice.run();
        this.discordBot.run();
    }
}

import { tmpdir } from "os";
let bridge = new DiscordMatrixBridge(tmpdir(), "./cfg");
bridge.run();
