import { APIEmbed, WebhookClient } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { logger } from "../../logger";
import { NypsiClient } from "../../models/Client";
import { requestUnban, requestUnmute } from "../../moderation/utils";

export function runLogs() {
    setInterval(async () => {
        const query = await prisma.moderation.findMany({
            where: {
                logs: { not: null },
            },
            select: {
                guildId: true,
                logs: true,
            },
        });

        let count = 0;

        for (const guild of query) {
            if ((await redis.llen(`nypsi:guild:logs:queue:${guild.guildId}`)) == 0) {
                continue;
            }
            const hook = new WebhookClient({ url: guild.logs });

            if (!hook) {
                await prisma.moderation.update({
                    where: {
                        guildId: guild.guildId,
                    },
                    data: {
                        logs: null,
                    },
                });
                continue;
            }

            const embeds: APIEmbed[] = [];

            if ((await redis.llen(`nypsi:guild:logs:queue:${guild.guildId}`)) > 10) {
                for (let i = 0; i < 10; i++) {
                    const current = await redis.rpop(`nypsi:guild:logs:queue:${guild.guildId}`);
                    embeds.push(JSON.parse(current) as APIEmbed);
                }
            } else {
                const current = await redis.lrange(`nypsi:guild:logs:queue:${guild.guildId}`, 0, 10);
                await redis.del(`nypsi:guild:logs:queue:${guild.guildId}`);
                for (const i of current) {
                    embeds.push(JSON.parse(i) as APIEmbed);
                }
            }

            embeds.reverse();

            await hook
                .send({ embeds: embeds })
                .then(() => {
                    count += embeds.length;
                })
                .catch(async (e) => {
                    console.log(e);
                    logger.error(`error sending logs to webhook (${guild.guildId})`);

                    await prisma.moderation.update({
                        where: {
                            guildId: guild.guildId,
                        },
                        data: {
                            logs: null,
                        },
                    });
                });
        }

        if (count > 0) {
            logger.log({ level: "auto", message: `sent ${count} logs` });
        }
    }, 5000);
}

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
                for (let i = 0; i < 10; i++) {
                    const current = await redis.rpop(`modlogs:${modlog.guildId}`);
                    embeds.push(JSON.parse(current) as APIEmbed);
                }
            } else {
                const current = await redis.lrange(`modlogs:${modlog.guildId}`, 0, 10);
                await redis.del(`modlogs:${modlog.guildId}`);
                for (const i of current) {
                    embeds.push(JSON.parse(i) as APIEmbed);
                }
                embeds.reverse();
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
