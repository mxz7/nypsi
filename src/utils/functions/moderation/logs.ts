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
  embed.setHeader(`${caseType}${caseID > -1 ? ` [${caseID}]` : ""}`, guild.iconURL());
  embed.setTimestamp();

  if (punished) {
    embed.addField("user", `${punished.username.replaceAll("_", "\\_")} \`${punished.id}\``, true);
  } else {
    embed.addField("user", userID, true);
  }

  if (moderator.id !== moderator.client.user.id) {
    embed.addField(
      "moderator",
      `${moderator.username.replaceAll("_", "\\_")} \`${moderator.id}\``,
      true,
    );
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

export async function isModLogsEnabled(guild: Guild) {
  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      modlogs: true,
    },
  });

  return !(!query || !query.modlogs || query.modlogs == "");
}

export async function setModLogs(guild: Guild, hook: string) {
  await redis.del(Constants.redis.cache.guild.MODLOGS_GUILDS);

  const previous = await getModLogsHook(guild);

  if (previous) {
    try {
      await previous.delete("modlogs moved/disabled");
    } catch {
      // silent fail
    }
  }

  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      modlogs: hook,
    },
  });
}

export async function getModLogsHook(guild: Guild): Promise<WebhookClient | undefined> {
  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      modlogs: true,
    },
  });

  if (!query.modlogs) return undefined;

  return new WebhookClient({ url: query.modlogs });
}
