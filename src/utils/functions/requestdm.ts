import { Manager } from "discord-hybrid-sharding";
import { MessageOptions, MessagePayload } from "discord.js";
import { logger } from "../logger";
import { NypsiClient } from "../models/Client";
import { CustomEmbed } from "../models/EmbedBuilders";

interface RequestDMOptions {
    memberId: string;
    content: string;
    embed?: CustomEmbed;
    client: NypsiClient | Manager;
}

export default async function requestDM(options: RequestDMOptions): Promise<boolean> {
    logger.info(`DM requested with ${options.memberId}`);

    if (options.client instanceof NypsiClient) {
        const clusterHas = await options.client.cluster.broadcastEval(
            async (c, { userId }) => {
                const client = c as NypsiClient;
                const user = await client.users.fetch(userId).catch(() => {});

                if (user) {
                    return client.cluster.id;
                } else {
                    return "not-found";
                }
            },
            {
                context: { userId: options.memberId },
            }
        );

        let shard: number;

        for (const i of clusterHas) {
            if (i != "not-found") {
                shard = i;
                break;
            }
        }

        if (isNaN(shard)) {
            logger.warn("user not found");
            return false;
        }

        const payload: MessageOptions = {
            content: options.content,
        };

        if (options.embed) {
            payload.embeds = [options.embed.toJSON()];
        }

        const res = await options.client.cluster.broadcastEval(
            async (c, { needed, memberId, payload }) => {
                const client = c as NypsiClient;
                if (client.cluster.id != needed) return false;

                const user = await client.users.fetch(memberId).catch(() => {});

                if (!user) return false;

                let fail = false;

                await user.send(payload as MessagePayload).catch(() => {
                    fail = true;
                });

                if (fail) {
                    return false;
                }
                return true;
            },
            {
                context: {
                    needed: shard,
                    memberId: options.memberId,
                    payload: payload,
                },
            }
        );

        if (res.includes(true)) {
            logger.log({
                level: "success",
                message: "DM sent",
            });
            return true;
        } else {
            logger.error("failed to send DM");
            return false;
        }
    } else {
        const clusterHas = await options.client.broadcastEval(
            async (c, { userId }) => {
                const client = c as NypsiClient;
                const user = await client.users.fetch(userId).catch(() => {});

                if (user) {
                    return client.cluster.id;
                } else {
                    return "not-found";
                }
            },
            {
                context: { userId: options.memberId },
            }
        );

        let shard: number;

        for (const i of clusterHas) {
            if (i != "not-found") {
                shard = i;
                break;
            }
        }

        if (isNaN(shard)) {
            logger.warn("user not found");
            return false;
        }

        const payload: MessageOptions = {
            content: options.content,
        };

        if (options.embed) {
            payload.embeds = [options.embed.toJSON()];
        }

        const res = await options.client.broadcastEval(
            async (c, { needed, memberId, payload }) => {
                const client = c as NypsiClient;
                if (client.cluster.id != needed) return false;

                const user = await client.users.fetch(memberId).catch(() => {});

                if (!user) return false;

                let fail = false;

                await user.send(payload as MessagePayload).catch(() => {
                    fail = true;
                });

                if (fail) {
                    return false;
                }
                return true;
            },
            {
                context: {
                    needed: shard,
                    memberId: options.memberId,
                    payload: payload,
                },
            }
        );

        if (res.includes(true)) {
            logger.log({
                level: "success",
                message: "DM sent",
            });
            return true;
        } else {
            logger.error("failed to send DM");
            return false;
        }
    }
}
