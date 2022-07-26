import * as Cluster from "discord-hybrid-sharding";
import { GatewayIntentBits, Options } from "discord.js";
import { NypsiClient } from "./utils/models/Client";

const client = new NypsiClient({
    allowedMentions: {
        parse: ["users", "roles"],
    },
    makeCache: Options.cacheWithLimits({
        MessageManager: 100,
    }),
    sweepers: {
        messages: {
            lifetime: 60,
            interval: 120,
        },
    },
    presence: {
        status: "dnd",
        activities: [
            {
                name: "nypsi.xyz",
            },
        ],
    },
    rest: {
        offset: 0,
    },
    shards: Cluster.Client.getInfo().SHARD_LIST,
    shardCount: Cluster.Client.getInfo().TOTAL_SHARDS,
    intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

import { loadCommands } from "./utils/commandhandler";
import { logger } from "./utils/logger";

loadCommands();
client.loadEvents();

setTimeout(() => {
    logger.info("logging in...");
    client.login(process.env.BOT_TOKEN).then(() => {
        client.user.setPresence({
            status: "dnd",
            activities: [
                {
                    name: "loading..",
                },
            ],
        });

        setTimeout(() => {
            client.runIntervals();
        }, 10000);

        if (process.env.GITHUB_ACTION) {
            setTimeout(() => {
                process.exit(0);
            }, 30000);
        }
    });
}, 500);
