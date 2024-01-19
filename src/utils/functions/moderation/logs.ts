import { flavors } from "@catppuccin/palette";
import { ColorResolvable, Guild, User, WebhookClient } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { LogType, PunishmentType } from "../../../types/Moderation";
import Constants from "../../Constants";

const logColors = new Map<LogType, ColorResolvable>();
const modLogColors = new Map<PunishmentType, ColorResolvable>();

logColors.set("server", flavors.mocha.colors.red.hex as ColorResolvable);
logColors.set("role", flavors.mocha.colors.pink.hex as ColorResolvable);
logColors.set("channel", flavors.mocha.colors.green.hex as ColorResolvable);
logColors.set("emoji", flavors.mocha.colors.peach.hex as ColorResolvable);
logColors.set("member", flavors.mocha.colors.sky.hex as ColorResolvable);
logColors.set("message", flavors.mocha.colors.flamingo.hex as ColorResolvable);

modLogColors.set("mute", flavors.macchiato.colors.yellow.hex as ColorResolvable);
modLogColors.set("unmute", flavors.macchiato.colors.yellow.hex as ColorResolvable);
modLogColors.set("ban", flavors.macchiato.colors.red.hex as ColorResolvable);
modLogColors.set("unban", flavors.macchiato.colors.red.hex as ColorResolvable);
modLogColors.set("warn", flavors.macchiato.colors.flamingo.hex as ColorResolvable);
modLogColors.set("kick", flavors.macchiato.colors.sky.hex as ColorResolvable);
modLogColors.set("filter violation", flavors.macchiato.colors.sapphire.hex as ColorResolvable);

let checkingLogsEnabled = false;

export async function addModLog(
  guild: Guild,
  caseType: PunishmentType,
  userID: string,
  moderator: User,
  command: string,
  caseID: number,
  channelId?: string,
  similarity?: string,
) {
  const punished = await guild.client.users.fetch(userID).catch(() => {});

  if (!punished) return;

  const embed = new CustomEmbed().disableFooter();
  embed.setColor(modLogColors.get(caseType));
  embed.setHeader(`${caseType}${caseID > -1 ? ` [${caseID}]` : ""}`);
  embed.setTimestamp();

  if (punished) {
    embed.addField("user", `${punished.username} \`${punished.id}\``, true);
  } else {
    embed.addField("user", userID, true);
  }

  if (moderator.id !== moderator.client.user.id) {
    embed.addField("moderator", `${moderator.username} \`${moderator.id}\``, true);
  } else {
    if (channelId) {
      embed.addField("moderator", `nypsi in <#${channelId}>`, true);
    } else {
      embed.addField("moderator", "nypsi", true);
    }
    if (similarity) {
      embed.setFooter({ text: `${similarity}% match to filtered word` });
    }
  }

  if (caseType == "filter violation") {
    embed.addField("message", command);
  } else {
    embed.addField("reason", command);
  }

  await redis.lpush(
    `${Constants.redis.cache.guild.MODLOGS}:${guild.id}`,
    JSON.stringify(embed.toJSON()),
  );
}

export async function addLog(guild: Guild, type: LogType, embed: CustomEmbed) {
  embed.setColor(logColors.get(type));

  await redis.lpush(
    `${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`,
    JSON.stringify(embed.toJSON()),
  );
}

export async function isLogsEnabled(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.guild.LOGS}:${guild.id}`)) {
    return (await redis.get(`${Constants.redis.cache.guild.LOGS}:${guild.id}`)) === "t"
      ? true
      : false;
  }

  if (checkingLogsEnabled) {
    return (await new Promise((resolve) => {
      setTimeout(() => {
        resolve(isLogsEnabled(guild));
      }, 200);
    })) as boolean;
  }

  checkingLogsEnabled = true;

  const query = await prisma.moderation
    .findUnique({
      where: {
        guildId: guild.id,
      },
      select: {
        logs: true,
      },
    })
    .catch(() => {
      checkingLogsEnabled = false;
      return null;
    });

  checkingLogsEnabled = false;

  if (!query || !query.logs) {
    await redis.set(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, "f");
    await redis.expire(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, 36000);
    return false;
  } else {
    await redis.set(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, "t");
    await redis.expire(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, 36000);
  }

  return true;
}

export async function setLogsChannelHook(guild: Guild, hook: string) {
  await redis.del(`${Constants.redis.cache.guild.LOGS}:${guild.id}`);
  await redis.del(Constants.redis.cache.guild.LOGS_GUILDS);

  if (!hook) {
    await redis.del(`${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`);
  }

  await prisma.moderation.update({
    where: {
      guildId: guild.id,
    },
    data: {
      logs: hook,
    },
  });
}

export async function getLogsChannelHook(guild: Guild) {
  if (await redis.exists(`nypsi:query:islogsenabled:searching:${guild.id}`)) {
    return (await new Promise((resolve) => {
      setTimeout(() => {
        resolve(getLogsChannelHook(guild));
      }, 200);
    })) as WebhookClient;
  }

  await redis.set(`nypsi:query:islogsenabled:searching:${guild.id}`, "t");
  await redis.expire(`nypsi:query:islogsenabled:searching:${guild.id}`, 60);

  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      logs: true,
    },
  });

  await redis.del(`nypsi:query:islogsenabled:searching:${guild.id}`);

  if (!query.logs) return undefined;

  return new WebhookClient({ url: query.logs });
}

export async function isModLogsEnabled(guild: Guild) {
  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      modlogs: true,
    },
  });

  if (!query || !query.modlogs || query.modlogs == "") return false;

  return true;
}

export async function setModLogs(guild: Guild, hook: string) {
  await redis.del(Constants.redis.cache.guild.MODLOGS_GUILDS);

  await prisma.moderation.update({
    where: {
      guildId: guild.id,
    },
    data: {
      modlogs: hook,
    },
  });
}

export async function getModLogsHook(guild: Guild): Promise<WebhookClient | undefined> {
  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      modlogs: true,
    },
  });

  if (!query.modlogs) return undefined;

  return new WebhookClient({ url: query.modlogs });
}
