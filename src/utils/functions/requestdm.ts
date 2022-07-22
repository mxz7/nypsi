import { MessageOptions, MessagePayload, ShardingManager } from "discord.js";
import { logger } from "../logger";
import { NypsiClient } from "../models/Client";
import { CustomEmbed } from "../models/EmbedBuilders";

interface RequestDMOptions {
    memberId: string;
    content: string;
    embed?: CustomEmbed;
    client: NypsiClient | ShardingManager;
}

export default async function requestDM(options: RequestDMOptions): Promise<boolean> {
    logger.info(`DM requested with ${options.memberId}`);

    let broadcastEval;

    if (options.client instanceof NypsiClient) {
        broadcastEval = options.client.shard.broadcastEval;
    } else {
        broadcastEval = options.client.broadcastEval;
    }

    const clusterHas = await broadcastEval(
        async (c, { userId }) => {
            const user = await c.users.fetch(userId).catch(() => {});

            if (user) {
                return c.shard.ids[0];
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

    const res = await broadcastEval(
        async (c, { needed, memberId, payload }) => {
            if (!c.shard.ids.includes(needed)) return false;

            const user = await c.users.fetch(memberId).catch(() => {});

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
