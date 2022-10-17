import { ColorResolvable, Guild, GuildMember, User, WebhookClient } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { LogType, PunishmentType } from "../../models/GuildStorage";

const logColors = new Map<LogType, ColorResolvable>();
const modLogColors = new Map<PunishmentType, ColorResolvable>();

logColors.set(LogType.SERVER, "#f7343a");
logColors.set(LogType.ROLE, "#a046fa");
logColors.set(LogType.CHANNEL, "#46fa7c");
logColors.set(LogType.EMOJI, "#f1fa46");
logColors.set(LogType.MEMBER, "#46befa");
logColors.set(LogType.MESSAGE, "#fa8b46");

modLogColors.set(PunishmentType.MUTE, "#ffffba");
modLogColors.set(PunishmentType.BAN, "#ffb3ba");
modLogColors.set(PunishmentType.UNMUTE, "#ffffba");
modLogColors.set(PunishmentType.WARN, "#bae1ff");
modLogColors.set(PunishmentType.KICK, "#ffdfba");
modLogColors.set(PunishmentType.UNBAN, "#ffb3ba");
modLogColors.set(PunishmentType.FILTER_VIOLATION, "#baffc9");

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

  await redis.lpush(`modlogs:${guild.id}`, JSON.stringify(embed.toJSON()));
}

export async function addLog(guild: Guild, type: LogType, embed: CustomEmbed) {
  embed.setColor(logColors.get(type));

  await redis.lpush(`nypsi:guild:logs:queue:${guild.id}`, JSON.stringify(embed.toJSON()));
}

export async function isLogsEnabled(guild: Guild) {
  if (await redis.exists(`cache:guild:logs:${guild.id}`)) {
    return (await redis.get(`cache:guild:logs:${guild.id}`)) === "t" ? true : false;
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
    await redis.set(`cache:guild:logs:${guild.id}`, "f");
    await redis.expire(`cache:guild:logs:${guild.id}`, 3600);
    return false;
  } else {
    await redis.set(`cache:guild:logs:${guild.id}`, "t");
    await redis.expire(`cache:guild:logs:${guild.id}`, 3600);
  }

  return true;
}

export async function setLogsChannelHook(guild: Guild, hook: string) {
  await redis.del(`cache:guild:logs:${guild.id}`);

  if (!hook) {
    await redis.del(`nypsi:guild:logs:queue:${guild.id}`);
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
