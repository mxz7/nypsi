import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { daysUntil, MStoTime } from "../date";

export function runCountdowns(client: NypsiClient) {
  const now = new Date();

  let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

  if (now.getHours() < 3) {
    d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
  }

  const needed = new Date(Date.parse(d) + 10800000);

  const doCountdowns = async () => {
    const query = await prisma.guildCountdown.findMany();

    for (const countdown of query) {
      const clusterHas = await client.cluster.broadcastEval(
        async (c, { channelId }) => {
          const client = c as NypsiClient;
          const channel = await client.channels.fetch(channelId).catch(() => {});

          if (channel) {
            return client.cluster.id;
          } else {
            return "not-found";
          }
        },
        {
          context: { channelId: countdown.channel },
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
        logger.warn(`countdown channel not found: ${countdown.guildId} ${countdown.channel}`);
        continue;
      }

      const days = daysUntil(new Date(countdown.date)) + 1;

      let message;

      if (days == 0) {
        message = countdown.finalFormat;
      } else {
        message = countdown.format.split("%days%").join(days.toLocaleString());
      }

      const embed = new CustomEmbed();

      embed.setDescription(message);
      embed.setColor(Constants.TRANSPARENT_EMBED_COLOR);
      embed.disableFooter();

      const res = await client.cluster.broadcastEval(
        async (c, { needed, embed, channelId }) => {
          const client = c as NypsiClient;
          if (client.cluster.id != needed) return false;

          const channel = await client.channels.fetch(channelId).catch(() => {});

          if (!channel) return false;
          if (!channel.isTextBased()) return false;

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
        }
      );

      if (res.includes(true)) {
        logger.log({
          level: "auto",
          message: `sent custom countdown (${countdown.id}) in ${countdown.guildId}`,
        });
      } else {
        logger.warn(`failed to send custom countdown (${countdown.id}) in ${countdown.guildId}`);
      }
    }

    for (const guildId of client.guilds.cache.keys()) {
      const guild = await client.guilds.fetch(guildId);

      if (!guild) continue;

      const query = await prisma.guildCountdown.findMany({
        where: {
          guildId: guildId,
        },
      });

      if (!query) continue;

      for (const countdown of query) {
        const days = daysUntil(new Date(countdown.date)) + 1;

        let message;

        if (days == 0) {
          message = countdown.finalFormat;
        } else {
          message = countdown.format.split("%days%").join(days.toLocaleString());
        }

        const embed = new CustomEmbed();

        embed.setDescription(message);
        embed.setColor(Constants.TRANSPARENT_EMBED_COLOR);
        embed.disableFooter();

        const channel = guild.channels.cache.find((ch) => ch.id == countdown.channel);

        if (!channel) continue;

        if (!channel.isTextBased()) continue;

        await channel
          .send({ embeds: [embed] })
          .then(() => {
            logger.log({
              level: "auto",
              message: `sent custom countdown (${countdown.id}) in ${guild.name} (${guildId})`,
            });
          })
          .catch(() => {
            logger.error(`error sending custom countdown (${countdown.id}) ${guild.name} (${guildId})`);
          });

        if (days <= 0) {
          await deleteCountdown(guildId, countdown.id);
        }
      }
    }
  };

  setTimeout(async () => {
    setInterval(() => {
      doCountdowns();
    }, 86400000);
    doCountdowns();
  }, needed.getTime() - now.getTime());

  logger.log({
    level: "auto",
    message: `custom countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
  });
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

export async function addCountdown(guild: Guild, date: Date | number, format: string, finalFormat: string, channel: string) {
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
