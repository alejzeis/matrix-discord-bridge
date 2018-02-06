const Discord = require("discord.js");
const YAML = require("yamljs");

const os = require("os");
const fs = require("fs");
const path = require("path");
const process = require("process");

const misc = require("./misc");
// Config and functions -----------------------------------------------------------------------------------------------------------------
const defaultConfig = {
    discord: {
        token: "",
    },
    matrix: {
        serverURL: "https://matrix.org",
        domain: "matrix.org"
    },
    mappings: [
        {
            discordGuild: "",
            discordChannel: "",
            matrixRoom: ""
        }
    ]
};
var config;
var tempDir = path.join(os.tmpdir(), "matrix-discord-bridge");


// Program Main ----------------------------------------------------------------------------------------------------------------------------


try {
    fs.mkdirSync(tempDir);
} catch(e) {
    // Already exists
}

try {
    config = YAML.load("bridgeConfiguration.yml");
} catch(e) {
    console.error("Could not load bridgeConfiguration.yml, perhaps it doesn't exist? Creating it...");
    fs.writeFileSync("bridgeConfiguration.yml", YAML.stringify(defaultConfig, 4));
    console.error("Configuration file created. Please fill out the fields and then run the program again.")
    process.exit(1);
}

// Create maps of matrix and discord channel and room corralations for easier and faster lookups.
let matrixMappings = new Map();
let discordMappings = new Map();

for(let i = 0; i < config.mappings.length; i++) {
    matrixMappings.set(config.mappings[i].matrixRoom, {guild: config.mappings[i].discordGuild, channel: config.mappings[i].discordChannel});
    discordMappings.set(config.mappings[i].discordChannel, config.mappings[i].matrixRoom);
}

const discordClient = new Discord.Client();
const Cli = require("matrix-appservice-bridge").Cli;
const Bridge = require("matrix-appservice-bridge").Bridge;
const AppServiceRegistration = require("matrix-appservice-bridge").AppServiceRegistration;
const localPart = "_discordBridgeService";
var bridge;
var botId;

discordClient.on("ready", () => {
    for(let i = 0; i < matrixMappings.size; i++) {
        let room = matrixMappings.keys().next().value;
        bridge.getIntent("@discord_BridgeService:" + config.matrix.domain).sendMessage(room, misc.getNoticeFormatted("**Connected to Discord**"));
    }
});

discordClient.login(config.discord.token);

new Cli({
    registrationPath: "discord-bridge-registration.yml",
    generateRegistration: function(reg, callback) {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart(localPart);
        reg.addRegexPattern("users", "@discord_.*", true);
        callback(reg);
    },
    run: function(port, cfg) {
        bridge = new Bridge({
            homeserverUrl: config.matrix.serverURL,
            domain: config.matrix.domain,
            registration: "discord-bridge-registration.yml",

            controller: {
                onUserQuery: function(queriedUser) {
                    return {}; // auto-provision users with no additonal data
                },

                onEvent: function(request, context) {
                    let event = request.getData();

                    switch(event.type) {
                        case "m.room.member":
                            if(event.content.membership == "invite" && event.state_key == "@" + localPart + ":" + config.matrix.domain) {
                                // Check if the room is found in our mappings
                                if(matrixMappings.has(event.room_id)) {
                                    // Room is in mappings, join ourselves and then the Bridge Service account
                                    bridge.getIntent().join(event.room_id).then(() => {
                                        bridge.getIntent("@" + localPart + ":" + config.matrix.domain).join(event.room_id).then(() => {
                                            bridge.getIntent().invite(event.room_id, "@discord_BridgeService:" + config.matrix.domain).then(() => { bridge.getIntent("@discord_BridgeService:" + config.matrix.domain).join(event.room_id)});
                                            bridge.getIntent("@discord_BridgeService:" + config.matrix.domain).setDisplayName("Discord Bridge Service");
                                        });
                                    });
                                }
                            }

                            // TODO: process other events
                            break;
                    }

                    if (event.type !== "m.room.message" || !event.content || event.room_id !== ROOM_ID) {
                        return;
                    }
                    console.log(event.user_id + " | " + event.content.body);
                }
            }
        });
        console.log("Matrix appservice listening on port %s", port);
        bridge.run(port, config);
    }
}).run();
