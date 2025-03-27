import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { daysUntil, MStoTime } from "../date";
import dayjs = require("dayjs");

export function runCountdowns(client: NypsiClient) {
  let start = 0;

  if (dayjs().hour() < 3) {
    start = dayjs().set("hour", 3).set("minute", 0).set("second", 0).toDate().getTime();
  } else {
    start = dayjs()
      .add(1, "day")
      .set("hour", 3)
      .set("minute", 0)
      .set("second", 0)
      .toDate()
      .getTime();
  }

  const needed = start - Date.now();

  const doCountdowns = async () => {
    const query = await prisma.guildCountdown.findMany();

    for (const countdown of query) {
      const clusterHas = await client.cluster.broadcastEval(
        async (c, { channelId }) => {
          const client = c as unknown as NypsiClient;
          const channel = client.channels.cache.get(channelId);

          if (channel) {
            return client.cluster.id;
          } else {
            return "not-found";
          }
        },
        {
          context: { channelId: countdown.channel },
        },
      );

      let shard: number;

      for (const i of clusterHas) {
        if (i != "not-found") {
          shard = i;
          break;
        }
      }

      if (isNaN(shard)) {
        logger.warn(`countdown channel not found: ${countdown.guildId} ${countdown.channel}`);
        await deleteCountdown(countdown.guildId, countdown.id);
        continue;
      }

      const days = daysUntil(new Date(countdown.date)) + 1;

      let message;

      if (days == 0) {
        message = countdown.finalFormat;
      } else if (days < 0) {
        await prisma.guildCountdown.delete({
          where: { guildId_id: { guildId: countdown.guildId, id: countdown.id } },
        });
        return;
      } else {
        message = countdown.format.split("%days%").join(days.toLocaleString());
      }

      const embed = new CustomEmbed();

      embed.setDescription(message);
      embed.setColor(Constants.PURPLE);
      embed.disableFooter();

      const res = await client.cluster.broadcastEval(
        async (c, { needed, embed, channelId }) => {
          const client = c as unknown as NypsiClient;
          if (client.cluster.id != needed) return false;

          const channel = client.channels.cache.get(channelId);

          if (!channel) return false;
          if (!channel.isSendable()) return false;

          let fail = false;

          await channel.send({ embeds: [embed] }).catch(() => {
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
            channelId: countdown.channel,
            embed: embed.toJSON(),
          },
        },
      );

      if (res.includes(true)) {
        logger.info(`::auto sent custom countdown (${countdown.id}) in ${countdown.guildId}`);
      } else {
        logger.warn(`failed to send custom countdown (${countdown.id}) in ${countdown.guildId}`);
      }
    }
  };

  setTimeout(async () => {
    setInterval(() => {
      doCountdowns();
    }, 86400000);
    doCountdowns();
  }, needed);

  logger.info(`::auto custom countdowns will run in ${MStoTime(needed)}`);
}

export async function getCountdowns(guild: Guild | string) {
  let guildID;

  if (guild instanceof Guild) {
    guildID = guild.id;
  } else {
    guildID = guild;
  }

  const query = await prisma.guildCountdown.findMany({
    where: {
      guildId: guildID,
    },
  });

  return query;
}

export async function getCountdown(guild: Guild | string, id: string) {
  let guildID;

  if (guild instanceof Guild) {
    guildID = guild.id;
  } else {
    guildID = guild;
  }

  const query = await prisma.guildCountdown.findFirst({
    where: {
      AND: [{ guildId: guildID }, { id: id }],
    },
  });

  return query;
}

export async function addCountdown(
  guild: Guild,
  date: Date | number,
  format: string,
  finalFormat: string,
  channel: string,
) {
  const countdowns = await getCountdowns(guild);

  const id = countdowns.length + 1;

  if (typeof date == "number") {
    date = new Date(date);
  }

  await prisma.guildCountdown.create({
    data: {
      date: date,
      format: format,
      finalFormat: finalFormat,
      channel: channel,
      id: id.toString(),
      guildId: guild.id,
    },
  });
}

export async function deleteCountdown(guild: Guild | string, id: string | number) {
  let guildID: string;

  if (guild instanceof Guild) {
    guildID = guild.id;
  } else {
    guildID = guild;
  }

  id = id.toString();

  await prisma.guildCountdown.deleteMany({
    where: {
      AND: [{ guildId: guildID }, { id: id }],
    },
  });
}
