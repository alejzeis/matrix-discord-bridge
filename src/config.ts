import * as YAML from "yamljs";

import { writeFileSync } from "fs";
import { exit } from "process";

import { LoggerInstance } from "winston";

const defaultConfig = {
    initalSyncAvatars: true,
    discord: {
        username: "",
        token: "",
    },
    matrix: {
        serverURL: "https://matrix.org",
        accessURL: "https://matrix.org",
        domain: "matrix.org",
        bridgeAccount: {
            userId: "@example:matrix.org",
            password: "password"
        }
    },
    guilds: []
};

export function loadConfig(location: string, logger: LoggerInstance) {
    try {
        return YAML.load(location);
    } catch(e) {
        logger.warn("Could not load configuration file, perhaps it doesn't exist? Creating it...", { location: location });
        writeFileSync(location, YAML.stringify(defaultConfig, 4));
        logger.info("Configuration file created, please fill out the fields and run the bridge again.");
        exit(1);
    }
}

export interface BridgeConfig {
    initalSyncAvatars: boolean;
    discord: DiscordConfig;
    matrix: MatrixConfig;
    guilds: Array<string>;
}

export interface DiscordConfig {
    username: string;
    token: string;
}

export interface MatrixConfig {
    serverURL: string;
    accessURL: string;
    domain: string;
    bridgeAccount: { userId: string, password: string };
}
