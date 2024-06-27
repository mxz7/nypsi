import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { cleanString } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cache = new Map<string, { hypixel: string; mojang: string }>();

const BASE = 10_000;
const GROWTH = 2_500;
const REVERSE_PQ_PREFIX = -(BASE - 0.5 * GROWTH) / GROWTH;
const REVERSE_CONST = REVERSE_PQ_PREFIX * REVERSE_PQ_PREFIX;
const GROWTH_DIVIDES_2 = 2 / GROWTH;

const ranks = new Map<string, string>();

ranks.set("MVP_PLUS", "MVP+");
ranks.set("MVP", "MVP");
ranks.set("VIP_PLUS", "VIP+");
ranks.set("VIP", "VIP");

const cmd = new Command("hypixel", "view hypixel stats for a minecraft account", "minecraft");

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}h <username>`)] });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 10);

  const username = cleanString(args[0]);

  let uuid;
  let hypixelData;

  if (cache.has(username.toLowerCase())) {
    hypixelData = cache.get(username.toLowerCase()).hypixel;
    uuid = cache.get(username.toLowerCase()).mojang;
  } else {
    const uuidURL = "https://api.mojang.com/users/profiles/minecraft/" + username;

    try {
      uuid = await fetch(uuidURL).then((uuidURL) => uuidURL.json());
    } catch (e) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid account")] });
    }

    const hypixelURL = `https://api.hypixel.net/player?uuid=${uuid.id}&key=${process.env.HYPIXEL_TOKEN}`;

    try {
      hypixelData = await fetch(hypixelURL).then((hypixelData) => hypixelData.json());
    } catch (e) {
      logger.error("hypixel error", e);
      return await message.channel.send({ embeds: [new ErrorEmbed("error fetching data")] });
    }

    if (!hypixelData.success) {
      return await message.channel.send({ embeds: [new ErrorEmbed("error fetching data")] });
    }

    cache.set(username.toLowerCase(), {
      hypixel: hypixelData,
      mojang: uuid,
    });

    setTimeout(() => {
      cache.delete(username.toLowerCase());
    }, 1800000);
  }

  const url = "https://plancke.io/hypixel/player/stats/" + uuid.id;
  const skin = `https://mc-heads.net/avatar/${uuid.id}/256`;

  let lastLog: any,
    firstLog: any,
    level: any,
    rank: any,
    streak: any,
    topStreak: any,
    karma: any,
    challenges: any,
    quests: any;

  try {
    lastLog = timeSince(new Date(hypixelData.player.lastLogin).getTime());
    firstLog = new Date(hypixelData.player.firstLogin).toLocaleString().split(", ")[0];
    level = getLevel(hypixelData.player.networkExp);
    rank = ranks.get(hypixelData.player.newPackageRank);
    streak = hypixelData.player.rewardStreak;
    topStreak = hypixelData.player.rewardHighScore;
    karma = hypixelData.player.karma;
    challenges = hypixelData.player.challenges;
    quests = hypixelData.player.achievements.general_quest_master;

    if (lastLog == 0) {
      lastLog = "today`";
    } else {
      lastLog = lastLog + "` days ago";
    }

    if (!rank) rank = "Default";

    if (hypixelData.player.monthlyPackageRank == "SUPERSTAR") rank = "MVP++";

    if (hypixelData.player.rank) {
      rank = hypixelData.player.rank;
    }

    if (hypixelData.player.prefix) {
      rank = hypixelData.player.prefix.substring(3, hypixelData.player.prefix.length - 4);
    }

    if (!streak) {
      streak = 0;
    } else {
      streak = streak.toLocaleString();
    }

    if (!topStreak) {
      topStreak = 0;
    } else {
      topStreak = topStreak.toLocaleString();
    }

    if (!karma) karma = 0;

    karma = karma.toLocaleString();

    if (!challenges) {
      challenges = 0;
    } else {
      challenges = hypixelData.player.challenges.all_time;
    }

    await Object.entries(challenges).forEach((c) => {
      if (!parseInt(challenges)) {
        challenges = 0;
      }

      challenges = challenges + c[1];
    });

    challenges = challenges.toLocaleString();

    if (!quests) {
      quests = 0;
    } else {
      quests = quests.toLocaleString();
    }
  } catch {
    if (cache.has(username.toLowerCase())) {
      cache.delete(username.toLowerCase());
    }
    return message.channel.send({ embeds: [new ErrorEmbed("error reading hypixel data")] });
  }

  const embed = new CustomEmbed(message.member)
    .setTitle("[" + rank + "] " + uuid.name)
    .addField("first login date", "`" + firstLog + "`", true)
    .addField("logged in", "`" + lastLog, true)
    .addField("streak ~ highest", "`" + streak + " ~ " + topStreak + "`", true)
    .addField("level", "`" + level.toLocaleString() + "`", true)
    .addField("karma", "`" + karma + "`", true)
    .addField("quests ~ challenges", "`" + quests + " ~ " + challenges + "`", true)
    .setURL(url)
    .setThumbnail(skin);

  return await message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;

function getLevel(exp: number) {
  return exp < 0
    ? 1
    : Math.floor(1 + REVERSE_PQ_PREFIX + Math.sqrt(REVERSE_CONST + GROWTH_DIVIDES_2 * exp));
}

function timeSince(date: number) {
  const ms = Math.floor(new Date().getTime() - date);

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));

  return days;
}
