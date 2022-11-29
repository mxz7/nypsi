import { variants } from "@catppuccin/palette";
import { ColorResolvable, Guild } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { logger } from "../../logger";
import { daysUntilChristmas, MStoTime } from "../date";

export function runChristmas(client: NypsiClient) {
  const now = new Date();

  let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

  if (now.getHours() < 3) {
    d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
  }

  const needed = new Date(Date.parse(d) + 10800000);

  const runChristmasThing = async () => {
    for (const guildId of client.guilds.cache.keys()) {
      const guild = await client.guilds.fetch(guildId);

      if (!guild) continue;

      const profile = await prisma.guildChristmas.findFirst({
        where: {
          AND: [
            {
              guildId: guildId,
            },
            {
              enabled: true,
            },
          ],
        },
      });

      if (!profile || !profile.channel) continue;

      const channel = await guild.channels.fetch(profile.channel);

      if (!channel) {
        logger.warn(`${guild.id}: couldn't find christmas channel`);
        // profile.enabled = false;
        // profile.channel = "none";
        // await setChristmasCountdown(guild, profile);
        continue;
      }

      let format = profile.format;

      const days = daysUntilChristmas();

      format = format.split("%days%").join(daysUntilChristmas().toString());

      if (days == "ITS CHRISTMAS") {
        format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO";
      }

      if (!channel.isTextBased()) continue;

      await channel
        .send({
          embeds: [
            new CustomEmbed()
              .setDescription(format)
              .setColor(variants.macchiato.red.hex as ColorResolvable)
              .setTitle(":santa_tone1:")
              .disableFooter(),
          ],
        })
        .then(() => {
          logger.log({
            level: "auto",
            message: `sent christmas countdown in ${guild.name} ~ ${format}`,
          });
        })
        .catch(async () => {
          logger.warn(`failed sending christmas countdown in ${guild.name} | ${guild.id}`);
          // profile.enabled = false;
          // profile.channel = "none";
          // await setChristmasCountdown(guild, profile);
        });
    }
  };

  setTimeout(async () => {
    setInterval(() => {
      runChristmasThing();
    }, 86400000);
    runChristmasThing();
  }, needed.getTime() - now.getTime());

  logger.log({
    level: "auto",
    message: `christmas countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
  });
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
          .setColor(variants.macchiato.red.hex as ColorResolvable)
          .setTitle(":santa_tone1:")
          .disableFooter(),
      ],
    })
    .then(() => {
      logger.log({
        level: "auto",
        message: `sent christmas countdown in ${guild.name} ~ ${format}`,
      });
    })
    .catch(async () => {
      logger.error(`error sending christmas countdown in ${guild.name}`);
      profile.enabled = false;
      profile.channel = "none";
      await setChristmasCountdown(guild, profile);
      return;
    });
}
