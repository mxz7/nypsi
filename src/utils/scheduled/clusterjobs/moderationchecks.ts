import { APIEmbed, WebhookClient } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { logger } from "../../logger";
import { NypsiClient } from "../../models/Client";
import { requestUnban, requestUnmute } from "../../moderation/utils";

export function runModerationChecks(client: NypsiClient) {
    setInterval(async () => {
        const date = new Date();

        const query1 = await prisma.moderationMute.findMany({
            where: {
                expire: { lte: date },
            },
            select: {
                userId: true,
                guildId: true,
            },
        });

        for (const unmute of query1) {
            logger.log({
                level: "auto",
                message: `requesting unmute in ${unmute.guildId} for ${unmute.userId}`,
            });
            await requestUnmute(unmute.guildId, unmute.userId, client);
        }

        const query2 = await prisma.moderationBan.findMany({
            where: {
                expire: { lte: date },
            },
            select: {
                userId: true,
                guildId: true,
            },
        });

        for (const unban of query2) {
            logger.log({
                level: "auto",
                message: `requesting unban in ${unban.guildId} for ${unban.userId}`,
            });
            await requestUnban(unban.guildId, unban.userId, client);
        }

        const query3 = await prisma.moderation.findMany({
            where: {
                NOT: { modlogs: "" },
            },
            select: {
                modlogs: true,
                guildId: true,
            },
        });

        let modLogCount = 0;

        for (const modlog of query3) {
            if (!(await redis.exists(`modlogs:${modlog.guildId}`)) || (await redis.llen(`modlogs:${modlog.guildId}`)) == 0)
                continue;

            const webhook = new WebhookClient({
                url: modlog.modlogs,
            });

            const embeds: APIEmbed[] = [];

            if ((await redis.llen(`modlogs:${modlog.guildId}`)) > 10) {
                const current = await redis.lpop(`modlogs:${modlog.guildId}`, 10);
                for (const i of current) {
                    embeds.push(JSON.parse(i) as APIEmbed);
                }
            } else {
                const current = await redis.lrange(`modlogs:${modlog.guildId}`, 0, 10);
                await redis.del(`modlogs:${modlog.guildId}`);
                for (const i of current) {
                    embeds.push(JSON.parse(i) as APIEmbed);
                }
            }

            modLogCount += embeds.length;

            await webhook.send({ embeds: embeds }).catch(async (e) => {
                logger.error(`error sending modlogs to webhook (${modlog.guildId}) - removing modlogs`);
                logger.error(e);

                await prisma.moderation.update({
                    where: {
                        guildId: modlog.guildId,
                    },
                    data: {
                        modlogs: "",
                    },
                });
            });
        }

        if (modLogCount > 0) {
            logger.log({
                level: "auto",
                message: `${modLogCount.toLocaleString()} modlogs sent`,
            });
        }
    }, 30000);
}
