import * as YAML from "yamljs";

import { writeFileSync } from "fs";
import { exit } from "process";

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

export function loadConfig(location: string) {
    try {
        return YAML.load(location);
    } catch(e) {
        console.error("Could not load " + location + ", perhaps it doesn't exist? Creating it...");
        writeFileSync(location, YAML.stringify(defaultConfig, 4));
        console.error("Configuration file created. Please fill out the fields and then run the program again.")
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
