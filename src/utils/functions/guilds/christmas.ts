import { flavors } from "@catppuccin/palette";
import { ColorResolvable, Guild } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { logger } from "../../logger";
import { MStoTime, daysUntilChristmas } from "../date";

export function runChristmas(client: NypsiClient) {
  const now = new Date();

  let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

  if (now.getHours() < 3) {
    d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
  }

  const needed = new Date(Date.parse(d) + 10800000);

  const runChristmasThing = async () => {
    const query = await prisma.guildChristmas.findMany({
      where: {
        enabled: true,
      },
      select: {
        channel: true,
        format: true,
        guildId: true,
      },
    });

    for (const guild of query) {
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
          context: { channelId: guild.channel },
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
        logger.warn(`christmas channel not found: ${guild.guildId} ${guild.channel}`);
        continue;
      }

      let format = guild.format;

      const days = daysUntilChristmas();

      format = format.split("%days%").join(daysUntilChristmas().toString());

      if (days == "ITS CHRISTMAS") {
        format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO";
      }

      const embed = new CustomEmbed()
        .setDescription(format)
        .setColor(flavors.macchiato.colors.red.hex as ColorResolvable)
        .setTitle(":santa_tone1:")
        .disableFooter();

      const res = await client.cluster.broadcastEval(
        async (c, { needed, embed, channelId }) => {
          const client = c as unknown as NypsiClient;
          if (client.cluster.id != needed) return false;

          const channel = client.channels.cache.get(channelId);

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
            channelId: guild.channel,
            embed: embed.toJSON(),
          },
        },
      );

      if (res.includes(true)) {
        logger.info(`::auto sent christmas countdown in ${guild.guildId} - ${format}`);
      } else {
        logger.warn(`failed to send christmas countdown: ${guild.guildId} ${guild.channel}`);
      }
    }
  };

  setTimeout(async () => {
    setInterval(() => {
      runChristmasThing();
    }, 86400000);
    runChristmasThing();
  }, needed.getTime() - now.getTime());

  logger.info(
    `::auto christmas countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
  );
}

export async function hasChristmasCountdown(guild: Guild) {
  const query = await prisma.guildChristmas.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      guildId: true,
    },
  });

  if (query) {
    return true;
  } else {
    return false;
  }
}

export async function createNewChristmasCountdown(guild: Guild) {
  await prisma.guildChristmas.create({
    data: {
      guildId: guild.id,
    },
  });
}

export async function getChristmasCountdown(guild: Guild) {
  const query = await prisma.guildChristmas.findUnique({
    where: {
      guildId: guild.id,
    },
  });

  return query;
}

export async function setChristmasCountdown(guild: Guild, xmas: any) {
  await prisma.guildChristmas.update({
    where: {
      guildId: guild.id,
    },
    data: {
      enabled: xmas.enabled,
      format: xmas.format,
      channel: xmas.channel,
    },
  });
}

export async function checkChristmasCountdown(guild: Guild) {
  const profile = await getChristmasCountdown(guild);

  const channel = guild.channels.cache.find((c) => c.id == profile.channel);

  if (!channel) {
    profile.enabled = false;
    profile.channel = "none";
    await setChristmasCountdown(guild, profile);
    return;
  }

  let format = profile.format;

  const days = daysUntilChristmas();

  format = format.split("%days%").join(daysUntilChristmas().toString());

  if (days == "ITS CHRISTMAS") {
    format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO";
  }

  if (!channel.isTextBased()) return;

  return await channel
    .send({
      embeds: [
        new CustomEmbed()
          .setDescription(format)
          .setColor(flavors.macchiato.colors.red.hex as ColorResolvable)
          .setTitle(":santa_tone1:")
          .disableFooter(),
      ],
    })
    .then(() => {
      logger.info(`::auto sent christmas countdown in ${guild.name} ~ ${format}`);
    })
    .catch(async () => {
      logger.error(`error sending christmas countdown in ${guild.name}`);
      profile.enabled = false;
      profile.channel = "none";
      await setChristmasCountdown(guild, profile);
      return;
    });
}
