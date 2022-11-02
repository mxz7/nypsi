import { variants } from "@catppuccin/palette";
import { ColorResolvable, Guild, GuildMember, User, WebhookClient } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { LogType, PunishmentType } from "../../../types/Moderation";
import Constants from "../../Constants";

const logColors = new Map<LogType, ColorResolvable>();
const modLogColors = new Map<PunishmentType, ColorResolvable>();

logColors.set(LogType.SERVER, variants.mocha.red.hex as ColorResolvable);
logColors.set(LogType.ROLE, variants.mocha.pink.hex as ColorResolvable);
logColors.set(LogType.CHANNEL, variants.mocha.green.hex as ColorResolvable);
logColors.set(LogType.EMOJI, variants.mocha.peach.hex as ColorResolvable);
logColors.set(LogType.MEMBER, variants.mocha.sky.hex as ColorResolvable);
logColors.set(LogType.MESSAGE, variants.mocha.flamingo.hex as ColorResolvable);

modLogColors.set(PunishmentType.MUTE, variants.macchiato.yellow.hex as ColorResolvable);
modLogColors.set(PunishmentType.UNMUTE, variants.macchiato.yellow.hex as ColorResolvable);
modLogColors.set(PunishmentType.BAN, variants.macchiato.red.hex as ColorResolvable);
modLogColors.set(PunishmentType.UNBAN, variants.macchiato.red.hex as ColorResolvable);
modLogColors.set(PunishmentType.WARN, variants.macchiato.flamingo.hex as ColorResolvable);
modLogColors.set(PunishmentType.KICK, variants.macchiato.sky.hex as ColorResolvable);
modLogColors.set(PunishmentType.FILTER_VIOLATION, variants.macchiato.sapphire.hex as ColorResolvable);

export async function addModLog(
  guild: Guild,
  caseType: PunishmentType,
  userID: string,
  moderator: string,
  command: string,
  caseID: number,
  channelId?: string,
  similarity?: string
) {
  let punished: GuildMember | User | void = await guild.members.fetch(userID).catch(() => {});

  if (!punished) {
    punished = await guild.client.users.fetch(userID).catch(() => {});
  }

  const embed = new CustomEmbed().disableFooter();
  embed.setColor(modLogColors.get(caseType));
  embed.setTitle(`${caseType}${caseID > -1 ? ` [${caseID}]` : ""}`);
  embed.setTimestamp();

  if (punished) {
    embed.addField("user", `${punished.toString()} (${punished.id})`, true);
  } else {
    embed.addField("user", userID, true);
  }

  if (moderator != "nypsi") {
    embed.addField("moderator", moderator, true);
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

  if (caseType == PunishmentType.FILTER_VIOLATION) {
    embed.addField("message content", command);
  } else {
    embed.addField("reason", command);
  }

  await redis.lpush(`${Constants.redis.cache.guild.MODLOGS}:${guild.id}`, JSON.stringify(embed.toJSON()));
}

export async function addLog(guild: Guild, type: LogType, embed: CustomEmbed) {
  embed.setColor(logColors.get(type));

  await redis.lpush(`${Constants.redis.nypsi.GUILD_LOG_QUEUE}:${guild.id}`, JSON.stringify(embed.toJSON()));
}

export async function isLogsEnabled(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.guild.LOGS}:${guild.id}`)) {
    return (await redis.get(`${Constants.redis.cache.guild.LOGS}:${guild.id}`)) === "t" ? true : false;
  }

  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      logs: true,
    },
  });

  if (!query || !query.logs) {
    await redis.set(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, "f");
    await redis.expire(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, 3600);
    return false;
  } else {
    await redis.set(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, "t");
    await redis.expire(`${Constants.redis.cache.guild.LOGS}:${guild.id}`, 3600);
  }

  return true;
}

export async function setLogsChannelHook(guild: Guild, hook: string) {
  await redis.del(`${Constants.redis.cache.guild.LOGS}:${guild.id}`);

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

export async function getLogsChannelHook(guild: Guild): Promise<WebhookClient | undefined> {
  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      logs: true,
    },
  });

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

  if (!query || !query.modlogs) return false;

  return true;
}

export async function setModLogs(guild: Guild, hook: string) {
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
