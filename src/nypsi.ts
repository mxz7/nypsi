import { NypsiClient } from "./utils/models/Client";
import { EmbedBuilder, GatewayIntentBits, MessageOptions, Options } from "discord.js";

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
    // shards: "auto",
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
import guildCreate from "./events/guildCreate";
import ready from "./events/ready";
import guildDelete from "./events/guildDelete";
import guildMemberUpdate from "./events/guildMemberUpdate";
import guildMemberAdd from "./events/guildMemberAdd";
import guildMemberRemove from "./events/guildMemberRemove";
import messageDelete from "./events/messageDelete";
import messageUpdate from "./events/messageUpdate";
import messageCreate from "./events/message";
import channelCreate from "./events/channelCreate";
import roleDelete from "./events/roleDelete";
import userUpdate from "./events/userUpdate";
import interactionCreate from "./events/interactionCreate";
import { logger } from "./utils/logger";
import { SnipedMessage } from "./utils/models/Snipe";

const snipe: Map<string, SnipedMessage> = new Map();
const eSnipe: Map<string, SnipedMessage> = new Map();

export { eSnipe, snipe };

loadCommands();

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

process.on("unhandledRejection", (e: any) => {
    const excludedReasons = [50013, 10008, 50001];

    if (e.code && excludedReasons.includes(e.code)) return;
    logger.error(`unhandled promise rejection: ${e.stack}`);
});

export async function requestDM(id: string, content: string, dmTekoh = false, embed?: EmbedBuilder): Promise<boolean> {
    logger.info(`DM requested with ${id}`);
    const member = await client.users.fetch(id);

    let payload: MessageOptions = {
        content: content,
    };

    if (embed) {
        payload = {
            content: content,
            embeds: [embed],
        };
    }

    if (member) {
        await member
            .send(payload)
            .then(() => {
                logger.log({
                    level: "success",
                    message: `successfully sent DM to ${member.tag} (${member.id})`,
                });
            })
            .catch(async () => {
                logger.warn(`failed to send DM to ${member.tag} (${member.id})`);
                if (dmTekoh) {
                    const tekoh = await client.users.fetch("672793821850894347");

                    await tekoh.send({ content: `failed to send dm to ${id}` });
                    await tekoh.send(payload);
                }
            });
        return true;
    } else {
        logger.warn(`failed to send DM to ${member.id}`);
        if (dmTekoh) {
            const tekoh = await client.users.fetch("672793821850894347");

            await tekoh.send({ content: `failed to send dm to ${id}` });
            await tekoh.send(payload);
        }
        return false;
    }
}

export async function requestRemoveRole(id: string, roleID: string) {
    const guild = await client.guilds.fetch("747056029795221513");

    if (!guild) {
        const tekoh = await client.users.fetch("672793821850894347");

        return await tekoh.send({ content: `failed to fetch guild - user: ${id} role: ${roleID}` });
    }

    const role = await guild.roles.fetch(roleID);

    if (!role) {
        const tekoh = await client.users.fetch("672793821850894347");

        return await tekoh.send({ content: `failed to fetch role - user: ${id} role: ${roleID}` });
    }

    const user = await guild.members.fetch(id);

    if (!user) {
        const tekoh = await client.users.fetch("672793821850894347");

        return await tekoh.send({ content: `failed to fetch role - user: ${id} role: ${roleID}` });
    }

    // 747066190530347089 boost role
    // 819870727834566696 silver role
    // 819870846536646666 gold role

    if (roleID == "819870727834566696") {
        if (
            user.roles.cache.find((r) => r.id == "747066190530347089") &&
            !user.roles.cache.find((r) => r.id == "819870727834566696")
        ) {
            return "boost";
        }
    }

    return await user.roles.remove(role);
}

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
