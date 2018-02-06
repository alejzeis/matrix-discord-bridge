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

console.log(config);

const Cli = require("matrix-appservice-bridge").Cli;
const Bridge = require("matrix-appservice-bridge").Bridge;
const AppServiceRegistration = require("matrix-appservice-bridge").AppServiceRegistration;

var botId;

new Cli({
    registrationPath: "discord-bridge-registration.yml",
    generateRegistration: function(reg, callback) {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart("DiscordBridgeService");
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
                            if(event.content.membership == "invite" && event.state_key == "@DiscordBridgeService:" + config.matrix.domain) {
                                bridge.getIntent().join(event.room_id);
                            }
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

        botId = bridge.getClient().getUserId();
        bridge.getClient().getProfileInfo(botId, "displayname").done((data) => {
            console.log(data);
        });
    }
}).run();
