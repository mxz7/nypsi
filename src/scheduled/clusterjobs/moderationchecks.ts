import dayjs = require("dayjs");
import { APIEmbed, WebhookClient } from "discord.js";

import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import Constants from "../../utils/Constants";
import { requestUnban } from "../../utils/functions/moderation/ban";
import { requestUnmute } from "../../utils/functions/moderation/mute";
import { logger } from "../../utils/logger";

export const unmuteTimeouts = new Set<string>();
export const unbanTimeouts = new Set<string>();

export function runLogs() {
  setInterval(async () => {
    let query: {
      id: string;
      logs: string;
    }[];

    if (await redis.exists(Constants.redis.cache.guild.LOGS_GUILDS)) {
      query = JSON.parse(await redis.get(Constants.redis.cache.guild.LOGS_GUILDS));
    } else {
      query = await prisma.guild.findMany({
        where: {
          logs: { not: null },
        },
        select: {
          id: true,
          logs: true,
        },
      });

      await redis.set(Constants.redis.cache.guild.LOGS_GUILDS, JSON.stringify(query), "EX", 3600);
    }

    let count = 0;

    for (const guild of query) {
      if ((await redis.llen(`${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`)) == 0) {
        continue;
      }
      const hook = new WebhookClient({ url: guild.logs });

      if (!hook) {
        await prisma.guild.update({
          where: {
            id: guild.id,
          },
          data: {
            logs: null,
          },
        });
        continue;
      }

      const embeds: APIEmbed[] = [];

      if ((await redis.llen(`${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`)) > 10) {
        for (let i = 0; i < 10; i++) {
          const current = await redis.rpop(`${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`);
          embeds.push(JSON.parse(current) as APIEmbed);
        }
      } else {
        const current = await redis.lrange(
          `${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`,
          0,
          10,
        );
        await redis.del(`${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`);
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
          logger.error(`error sending logs to webhook (${guild.id})`);

          await prisma.guild.update({
            where: {
              id: guild.id,
            },
            data: {
              logs: null,
            },
          });
        });
      hook.destroy();
    }

    if (count > 0) {
      logger.info(`::auto sent ${count} logs`);
    }

    let modlogsQuery: {
      id: string;
      modlogs: string;
    }[];

    if (await redis.exists(Constants.redis.cache.guild.MODLOGS_GUILDS)) {
      modlogsQuery = JSON.parse(await redis.get(Constants.redis.cache.guild.MODLOGS_GUILDS));
    } else {
      modlogsQuery = await prisma.guild.findMany({
        where: {
          modlogs: { not: null },
        },
        select: {
          id: true,
          modlogs: true,
        },
      });

      await redis.set(
        Constants.redis.cache.guild.MODLOGS_GUILDS,
        JSON.stringify(modlogsQuery),
        "EX",
        3600,
      );
    }

    let modLogCount = 0;

    for (const modlog of modlogsQuery) {
      if (
        !(await redis.exists(`${Constants.redis.cache.guild.MODLOGS}:${modlog.id}`)) ||
        (await redis.llen(`${Constants.redis.cache.guild.MODLOGS}:${modlog.id}`)) == 0
      )
        continue;

      let webhook: WebhookClient;

      try {
        webhook = new WebhookClient({ url: modlog.modlogs });
      } catch (e) {
        logger.error(`invalid webhook` + modlog);
        await prisma.guild.update({
          where: {
            id: modlog.id,
          },
          data: {
            modlogs: null,
          },
        });
      }

      const embeds: APIEmbed[] = [];

      if ((await redis.llen(`${Constants.redis.cache.guild.MODLOGS}:${modlog.id}`)) > 10) {
        for (let i = 0; i < 10; i++) {
          const current = await redis.rpop(`${Constants.redis.cache.guild.MODLOGS}:${modlog.id}`);
          embeds.push(JSON.parse(current) as APIEmbed);
        }
      } else {
        const current = await redis.lrange(
          `${Constants.redis.cache.guild.MODLOGS}:${modlog.id}`,
          0,
          10,
        );
        await redis.del(`${Constants.redis.cache.guild.MODLOGS}:${modlog.id}`);
        for (const i of current) {
          embeds.push(JSON.parse(i) as APIEmbed);
        }
        embeds.reverse();
      }

      modLogCount += embeds.length;

      await webhook.send({ embeds: embeds }).catch(async (e) => {
        logger.error(`error sending modlogs to webhook (${modlog.id}) - removing modlogs`);
        logger.error("moderation checks error", e);

        await prisma.guild.update({
          where: {
            id: modlog.id,
          },
          data: {
            modlogs: "",
          },
        });
      });
      webhook.destroy();
    }

    if (modLogCount > 0) {
      logger.info(
        `::auto ${modLogCount.toLocaleString()} modlog${modLogCount != 1 ? "s" : ""} sent`,
      );
    }
  }, 2500);
}

export function runModerationChecks(client: NypsiClient) {
  setInterval(async () => {
    const date = dayjs().add(2, "minute").toDate();

    const query1 = await prisma.moderationMute.findMany({
      where: {
        expire: { lte: date },
      },
      select: {
        userId: true,
        guildId: true,
        expire: true,
      },
    });

    for (const unmute of query1) {
      if (unmuteTimeouts.has(`${unmute.guildId}_${unmute.userId}`)) continue;
      if (unmute.expire.getTime() - Date.now() < 1000) {
        logger.info(`::auto requesting unmute in ${unmute.guildId} for ${unmute.userId}`);
        await requestUnmute(unmute.guildId, unmute.userId, client);
      } else {
        unmuteTimeouts.add(`${unmute.guildId}_${unmute.userId}`);
        setTimeout(() => {
          logger.info(`::auto requesting unmute in ${unmute.guildId} for ${unmute.userId}`);
          requestUnmute(unmute.guildId, unmute.userId, client);
        }, unmute.expire.getTime() - Date.now());
      }
    }

    const query2 = await prisma.moderationBan.findMany({
      where: {
        expire: { lte: date },
      },
      select: {
        userId: true,
        guildId: true,
        expire: true,
      },
    });

    for (const unban of query2) {
      if (unbanTimeouts.has(`${unban.guildId}_${unban.userId}`)) continue;
      if (unban.expire.getTime() - Date.now() < 1000) {
        logger.info(`::auto requesting unban in ${unban.guildId} for ${unban.userId}`);
        await requestUnban(unban.guildId, unban.userId, client);
      } else {
        unbanTimeouts.add(`${unban.guildId}_${unban.userId}`);
        setTimeout(() => {
          logger.info(`::auto requesting unban in ${unban.guildId} for ${unban.userId}`);
          requestUnban(unban.guildId, unban.userId, client);
        }, unban.expire.getTime() - Date.now());
      }
    }
  }, 90000);
}
