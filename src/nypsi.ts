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

import channelCreate from "./events/channelCreate";
import guildCreate from "./events/guildCreate";
import guildDelete from "./events/guildDelete";
import guildMemberAdd from "./events/guildMemberAdd";
import guildMemberRemove from "./events/guildMemberRemove";
import guildMemberUpdate from "./events/guildMemberUpdate";
import interactionCreate from "./events/interactionCreate";
import messageCreate from "./events/message";
import messageDelete from "./events/messageDelete";
import messageUpdate from "./events/messageUpdate";
import ready from "./events/ready";
import roleDelete from "./events/roleDelete";
import userUpdate from "./events/userUpdate";
import { loadCommands } from "./utils/commandhandler";
import { logger } from "./utils/logger";
console.log("b");
loadCommands();
console.log("c");

client.once("ready", ready.bind(null, client));
if (!process.env.GITHUB_ACTION) {
    client.on("guildCreate", guildCreate.bind(null, client));
    client.on("guildDelete", guildDelete.bind(null, client));
    client.rest.on("rateLimited", (rate) => {
        const a = rate.route.split("/");
        const reason = a[a.length - 1];
        logger.warn("rate limit: " + reason);
    });
    client.on("guildMemberUpdate", guildMemberUpdate.bind(null));
    client.on("guildMemberAdd", guildMemberAdd.bind(null));
    client.on("guildMemberRemove", guildMemberRemove.bind(null));
    client.on("messageDelete", messageDelete.bind(null));
    client.on("messageUpdate", messageUpdate.bind(null));
    client.on("messageCreate", messageCreate.bind(null));
    client.on("channelCreate", channelCreate.bind(null));
    client.on("roleDelete", roleDelete.bind(null));
    client.on("userUpdate", userUpdate.bind(null));
    client.on("interactionCreate", interactionCreate.bind(null));
}

client.on("shardReady", (shardID) => {
    logger.info(`shard#${shardID} ready`);
});
client.on("shardDisconnect", (s, shardID) => {
    logger.info(`shard#${shardID} disconnected`);
});
client.on("shardError", (error1, shardID) => {
    logger.error(`shard#${shardID} error: ${error1}`);
});
client.on("shardReconnecting", (shardID) => {
    logger.info(`shard#${shardID} connecting`);
});
client.on("shardResume", (shardId) => {
    logger.info(`shard#${shardId} resume`);
});

process.on("uncaughtException", (e: any) => {
    const excludedReasons = [50013, 10008, 50001];

    if (e.code && excludedReasons.includes(e.code)) return;
    logger.error(`unhandled promise rejection: ${e.stack}`);
});

process.on("unhandledRejection", (e: any) => {
    const excludedReasons = [50013, 10008, 50001];

    if (e.code && excludedReasons.includes(e.code)) return;
    logger.error(`unhandled promise rejection: ${e.stack}`);
});

console.log("a");

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
