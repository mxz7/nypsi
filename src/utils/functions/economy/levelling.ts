import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addKarma } from "../karma/karma";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getLastKnownAvatar } from "../users/tag";
import { addTag } from "../users/tags";
import { addBalance, getBankBalance, removeBankBalance } from "./balance";
import { addBooster, getBoosters } from "./boosters";
import { addInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { addTaskProgress } from "./tasks";
import { getXp, removeXp } from "./xp";
import ms = require("ms");
import dayjs = require("dayjs");
import _ = require("lodash");

const levellingRewards = new Map<number, { text: string[]; rewards?: string[] }>();

levellingRewards.set(1, {
  text: [
    "congratulations on your first level up and welcome to nypsi!!\ndon't forget to </vote:1014905682341924944> daily for rewards\n" +
      "- 🔮 50 karma" +
      "\n- $30,000",
  ],
  rewards: ["karma:50", "money:30000"],
});
levellingRewards.set(3, {
  text: [
    "congratulations on level 3!! it's about time we teach you about workers\n" +
      "\nworkers fill up their capacity in the background, whether you're using nypsi or not. when workers are full, you can use </workers claim:1014905682341924945> to empty their inventory and earn money." +
      "\nthe quarry worker sometimes finds *scraps* and *shards*, which can be used to craft gems and worker upgrades\n" +
      "\nyou have unlocked:" +
      "\n- 🪨 quarry worker (</workers view:1014905682341924945>)",
  ],
});
levellingRewards.set(5, { text: ["you will now receive 2 📦 vote crates when voting"] });
levellingRewards.set(7, {
  text: [
    "just a little bonus for my favourite number 😁\n\n" +
      "- `1x` 📦 basic crate" +
      "\n- `$100,000`",
  ],
  rewards: ["id:basic_crate", "money:100000"],
});
levellingRewards.set(10, {
  text: [
    "you're making *very* good progress. keep it up!!\n\n" +
      "- `2x` 📦 basic crate" +
      "\n- 🔮 100 karma" +
      "\n- $100,000\n" +
      "you have unlocked:" +
      "\n- 🥔 potato farmer (</workers view:1014905682341924945>)" +
      "\n- +1% gamble multi",
  ],
  rewards: ["id:basic_crate", "id:basic_crate", "karma:100", "money:100000"],
});
levellingRewards.set(15, { text: ["you will now receive 3 📦 vote crates when voting"] });
levellingRewards.set(20, { text: ["you have unlocked:\n" + "- +1% gamble multi"] });
levellingRewards.set(25, {
  text: ["you have unlocked:" + "- 🎣 fisherman (</workers view:1014905682341924945>)"],
});
levellingRewards.set(30, { text: ["you will now receive 4 📦 vote crates when voting"] });
levellingRewards.set(35, { text: ["you have unlocked:\n" + "- +1% gamble multi"] });
levellingRewards.set(40, {
  text: ["you have unlocked:\n" + "- 🍟 mcdonalds (</workers view:1014905682341924945>)"],
});
levellingRewards.set(50, {
  text: [
    "you will now receive 5 📦 vote crates when voting\n\nyou have unlocked:" +
      "\n- ⛏️ miner (</workers view:1014905682341924945>)" +
      "\n- 🪓 lumberjack (</workers view:1014905682341924945>)" +
      "\n- 🥓 butcher (</workers view:1014905682341924945>)" +
      "\n- +1% gamble multi",
  ],
});
levellingRewards.set(69, {
  text: ["hahaaaaahaha......\n\n" + "- `3x` 🎁 69420 crate"],
  rewards: ["id:69420_crate", "id:69420_crate", "id:69420_crate"],
});
levellingRewards.set(75, {
  text: ["you have unlocked:\n" + "- 👕 tailor (</workers view:1014905682341924945>)"],
});
levellingRewards.set(100, {
  text: [
    "you have unlocked:\n" +
      "- 🚀 spacex (</workers view:1014905682341924945>)\n" +
      "- 📦 amazon (</workers view:1014905682341924945>)\n" +
      "- create your own guild\n" +
      "- +1% gamble multi",
  ],
});
levellingRewards.set(200, {
  text: ["you have unlocked:\n" + "- avatar history tracking (disabled with $toggletracking)"],
});
levellingRewards.set(250, {
  text: ["you have unlocked:\n" + "- +1% gamble multi"],
});
levellingRewards.set(1000, {
  text: ["- ✨ prestige 10 tag"],
  rewards: ["tag:p10"],
});
levellingRewards.set(1500, {
  text: ["- ⭐️ prestige 15 tag"],
  rewards: ["tag:p15"],
});
levellingRewards.set(2000, {
  text: ["- 🌟 prestige 20 tag"],
  rewards: ["tag:p20"],
});
levellingRewards.set(2500, {
  text: ["- 💫 prestige 25 tag"],
  rewards: ["tag:p25"],
});
levellingRewards.set(3000, {
  text: [
    "you have received:\n" +
      "- ❤️ prestige 30 tag\n" +
      "- <:nypsi_omega:1139279162276855890> omega crate",
  ],
  rewards: ["tag:p30", "id:omega_crate"],
});
levellingRewards.set(4000, {
  text: ["- 💛 prestige 40 tag"],
  rewards: ["tag:p40"],
});
levellingRewards.set(5000, {
  text: ["- 💜 prestige 50 tag"],
  rewards: ["tag:p50"],
});
levellingRewards.set(6000, {
  text: [
    "you have received:\n" +
      "- 🖤 prestige 60 tag\n" +
      "- <:nypsi_omega:1139279162276855890> omega crate",
  ],
  rewards: ["tag:p60", "id:omega_crate"],
});
levellingRewards.set(7000, {
  text: ["- 🤍 prestige 70 tag"],
  rewards: ["tag:p70"],
});

const xpFormula = (level: number, prestige: number) => {
  let prestigeModified = prestige;
  if (prestige > 10) prestigeModified = 10;

  return Math.floor(Math.pow(level + 1, 1.117 + 0.077 * prestigeModified) + 50 + 15 * prestige) - 1;
};
const moneyFormula = (level: number) => Math.floor(Math.pow(level + 1, 2.103) + 10_000) - 1;
const cratesFormula = (rawLevel: number) => {
  const prestige = Math.floor(rawLevel / 100);
  const level = rawLevel - prestige * 100;
  const neededXp = xpFormula(level, prestige);

  let crates = neededXp / 200 + prestige * 0.69;

  if (rawLevel < 1000) {
    if (rawLevel % 30 !== 0) crates = 0;
  } else if (rawLevel < 1500) {
    crates = neededXp / 250;
    if (rawLevel % 30 !== 0) crates = 0;
  } else if (rawLevel < 2000) {
    crates = neededXp / 250;
    if (rawLevel % 25 !== 0) crates = 0;
  } else if (rawLevel < 3000) {
    crates = neededXp / 300;
    if (rawLevel % 25 !== 0) crates = 0;
  } else if (rawLevel < 4000) {
    crates = neededXp / 350;
    if (rawLevel % 20 !== 0) crates = 0;
  } else if (rawLevel < 5000) {
    crates = neededXp / 400;
    if (rawLevel % 15 !== 0) crates = 0;
  } else if (rawLevel < 6000) {
    crates = neededXp / 400;
    if (rawLevel % 15 !== 0) crates = 0;
  } else {
    crates = neededXp / 400;
    if (rawLevel % 15 !== 0) crates = 0;
  }

  return Math.floor(crates);
};

export async function getPrestige(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.PRESTIGE}:${id}`);

  if (cache) {
    return parseInt(cache);
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      prestige: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.PRESTIGE}:${id}`, query.prestige);
  await redis.expire(`${Constants.redis.cache.economy.PRESTIGE}:${id}`, ms("1 hour") / 1000);

  return query.prestige;
}

export async function setPrestige(member: GuildMember | string, amount: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.economy.update({
    where: {
      userId: id,
    },
    data: {
      prestige: amount,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.PRESTIGE}:${id}`);
}

export async function getLevel(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.LEVEL}:${id}`);

  if (cache) {
    return parseInt(cache);
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      level: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.LEVEL}:${id}`, query.level);
  await redis.expire(`${Constants.redis.cache.economy.LEVEL}:${id}`, ms("12 hours") / 1000);

  return query.level;
}

export async function getRawLevel(member: GuildMember | string) {
  let [level, prestige] = await Promise.all([getLevel(member), getPrestige(member)]);

  while (prestige > 0) {
    prestige--;
    level += 100;
  }

  return prestige * 100 + level;
}

export async function setLevel(member: GuildMember | string, amount: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.update({
    where: {
      userId: id,
    },
    data: {
      level: amount,
    },
    select: {
      level: true,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.LEVEL}:${id}`);

  return query.level;
}

export function getLevelRequirements(prestige: number, level: number) {
  while (level >= 100) {
    prestige++;
    level -= 100;
  }

  const rawLevel = prestige * 100 + level;

  const requiredXp = xpFormula(level, prestige);
  const requiredMoney = moneyFormula(rawLevel);

  return { xp: requiredXp, money: requiredMoney };
}

export async function getUpgrades(member: GuildMember | string): Promise<
  {
    upgradeId: string;
    amount: number;
  }[]
> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.UPGRADES}:${id}`);

  if (cache) return JSON.parse(cache);

  const query = await prisma.upgrades.findMany({
    where: {
      userId: id,
    },
    select: {
      amount: true,
      upgradeId: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.UPGRADES}:${id}`,
    JSON.stringify(query),
    "EX",
    3600,
  );

  return query;
}

export async function setUpgrade(member: GuildMember | string, upgradeId: string, amount: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (amount === 0)
    await prisma.upgrades.delete({ where: { userId_upgradeId: { userId: id, upgradeId } } });
  else
    await prisma.upgrades.upsert({
      where: {
        userId_upgradeId: {
          upgradeId,
          userId: id,
        },
      },
      update: {
        upgradeId,
        amount,
      },
      create: {
        amount,
        upgradeId,
        userId: id,
      },
    });

  await redis.del(`${Constants.redis.cache.economy.UPGRADES}:${id}`);

  return await getUpgrades(member);
}

export async function doLevelUp(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.LEVELLING_UP}:${id}`)) return;

  const [beforePrestige, beforeLevel] = await Promise.all([getPrestige(id), getLevel(id)]);
  let requirements = getLevelRequirements(beforePrestige, beforeLevel);
  const [beforeXp, beforeBank] = await Promise.all([getXp(id), getBankBalance(id)]);

  if (beforeXp < requirements.xp || beforeBank < requirements.money) {
    await redis.del(`${Constants.redis.cache.economy.LEVELLING_UP}:${id}`);
    return;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.LEVELLING_UP}:${id}`)) return;

  await redis.set(`${Constants.redis.cache.economy.LEVELLING_UP}:${id}`, "t", "EX", 600);

  let totalUsedXp = 0;
  let totalUsedBank = 0;
  let levels = 0;

  const items = new Map<string, number>();
  const tags: string[] = [];
  let earnedMoney = 0;
  let earnedKarma = 0;
  const rewardsText = new Map<number, string[]>();

  async function levelUp(consecutive = 0) {
    if (consecutive >= 10) {
      const [afterXp, afterBank, afterLevel, afterPrestige] = await Promise.all([
        getXp(id),
        getBankBalance(id),
        getLevel(id),
        getPrestige(id),
      ]);

      if (
        afterXp === beforeXp &&
        beforeBank === afterBank &&
        afterLevel === beforeLevel &&
        afterPrestige === beforePrestige &&
        levels > 0
      )
        return true;
      return false;
    }

    requirements = getLevelRequirements(beforePrestige, beforeLevel + levels);

    // ends with checks for before values being changed
    if (beforeBank - totalUsedBank < requirements.money || beforeXp - totalUsedXp < requirements.xp)
      return levelUp(1000);

    totalUsedXp += requirements.xp;
    totalUsedBank += requirements.money;
    levels++;

    const rawLevel = beforePrestige * 100 + (beforeLevel + levels);

    const levelData = levellingRewards.get(rawLevel);

    if (levelData?.text) rewardsText.set(rawLevel, levelData.text);

    if (levelData?.rewards) {
      for (const reward of levelData.rewards) {
        if (reward.startsWith("id:")) {
          if (items.has(reward.substring(3)))
            items.set(reward.substring(3), items.get(reward.substring(3)) + 1);
          else items.set(reward.substring(3), 1);
        } else if (reward.startsWith("money:")) {
          earnedMoney += parseInt(reward.substring(6));
        } else if (reward.startsWith("karma:")) {
          earnedKarma += parseInt(reward.substring(6));
        } else if (reward.startsWith("tag:")) {
          tags.push(reward.substring(4));
        }
      }
    } else {
      const crates = cratesFormula(rawLevel);

      if (crates > 0) {
        if (items.has("basic_crate")) items.set("basic_crate", items.get("basic_crate") + crates);
        else items.set("basic_crate", crates);

        rewardsText.has(rawLevel)
          ? rewardsText
              .get(rawLevel)
              .push(`- \`${crates}x\` 📦 basic crate${crates > 1 ? "s" : ""}`)
          : rewardsText.set(rawLevel, [`- \`${crates}x\` 📦 basic crate${crates > 1 ? "s" : ""}`]);
      }

      if (rawLevel % 200 === 0) {
        if (items.has("nypsi_crate")) items.set("nypsi_crate", items.get("nypsi_crate") + 1);
        else items.set("nypsi_crate", 1);

        rewardsText.has(rawLevel)
          ? rewardsText.get(rawLevel).push("- `1x` <:xnypsi:1135923012458254416> nypsi crate")
          : rewardsText.set(rawLevel, ["- `1x` <:xnypsi:1135923012458254416> nypsi crate"]);
      }

      if (rawLevel % 69 === 0) {
        if (items.has("69420_crate")) items.set("69420_crate", items.get("69420_crate") + 5);
        else items.set("69420_crate", 5);

        rewardsText.has(rawLevel)
          ? rewardsText.get(rawLevel).push("- `5x` 🎁 69420 crate")
          : rewardsText.set(rawLevel, ["- `5x` 🎁 69420 crate"]);
      }

      if (rawLevel % 750 === 0) {
        if (items.has("bronze_credit")) items.set("bronze_credit", items.get("bronze_credit") + 1);
        else items.set("bronze_credit", 1);

        rewardsText.has(rawLevel)
          ? rewardsText
              .get(rawLevel)
              .push("- `1x` <:nypsi_bronze:1108083689478443058> bronze credit")
          : rewardsText.set(rawLevel, ["- `1x` <:nypsi_bronze:1108083689478443058> bronze credit"]);
      }

      if (rawLevel % 1500 === 0) {
        if (items.has("omega_crate")) items.set("omega_crate", items.get("omega_crate") + 1);
        else items.set("omega_crate", 1);

        rewardsText.has(rawLevel)
          ? rewardsText.get(rawLevel).push("- `1x` <:nypsi_omega:1139279162276855890> omega crate")
          : rewardsText.set(rawLevel, ["- `1x` <:nypsi_omega:1139279162276855890> omega crate"]);
      }
    }

    return levelUp(consecutive + 1);
  }

  const res = await levelUp().catch((e) => {
    logger.error("level up failed", e);
    console.error(e);
    return false;
  });

  if (!res) {
    await redis.del(`${Constants.redis.cache.economy.LEVELLING_UP}:${id}`);
    return;
  }

  await removeXp(id, totalUsedXp, false);
  await removeBankBalance(id, totalUsedBank, false);
  await setLevel(id, beforeLevel + levels);
  addStat(id, "spent-level", totalUsedBank);
  addTaskProgress(id, "levelup_weekly", levels);

  logger.info(
    `${id} levelled up ${beforePrestige * 100 + beforeLevel} -> ${beforePrestige * 100 + beforeLevel + levels} (P${beforePrestige}L${beforeLevel} -> P${beforePrestige}L${beforeLevel + levels})`,
  );

  if (items.size > 0) {
    for (const [itemId, amount] of items.entries()) {
      await addInventoryItem(id, itemId, amount);
    }
  }
  if (tags.length > 0) {
    for (const tag of tags) {
      await addTag(id, tag);
    }
  }
  if (earnedKarma > 0) await addKarma(id, earnedKarma);
  if (earnedMoney > 0) await addBalance(id, earnedMoney);

  let earnedBooster: "no" | "double" | "yes" = "no";

  for (let i = beforeLevel + 1; i <= beforeLevel + levels; i++) {
    const rawLevel = beforePrestige * 100 + i;

    if (rawLevel % 50 === 0) {
      if (rawLevel.toString().endsWith("50")) earnedBooster = "double";
      else earnedBooster = "yes";
    }
  }

  if (earnedBooster !== "no") {
    const boosters = await getBoosters(id);

    if (!boosters.has("xp_booster")) {
      let time = 10;
      if (beforePrestige >= 5) time = 15;
      if (earnedBooster === "double") time *= 2;

      await addBooster(id, "xp_booster", 1, dayjs().add(time, "minutes").toDate());

      const highest = inPlaceSort(Array.from(rewardsText.keys())).asc()[0];
      if (!rewardsText.has(highest)) {
        rewardsText.set(beforeLevel + levels, [`- \`${time}m\` ✨ xp booster`]);
      } else rewardsText.get(highest).push(`- \`${time}m\` ✨ xp booster`);
    }
  }

  await redis.del(`${Constants.redis.cache.economy.LEVELLING_UP}:${id}`);

  const embed = new CustomEmbed(member).setHeader(
    "level up",
    member instanceof GuildMember ? member.user.avatarURL() : await getLastKnownAvatar(id),
  );

  let desc = `you are now **${beforePrestige > 0 ? `prestige ${beforePrestige} ` : ""}level ${beforeLevel + levels}**`;

  if (rewardsText.size > 0) {
    desc += "\n\n";

    for (const [key, value] of rewardsText.entries()) {
      const level = beforePrestige > 0 ? key - beforePrestige * 100 : key;
      if (rewardsText.size > 1 || levels > 1)
        desc += `-- ${beforePrestige > 0 ? `prestige ${beforePrestige} ` : ""}level ${level} --\n\n`;

      desc += value.join("\n");
      desc += "\n\n";
    }
  }

  embed.setDescription(desc);

  const dmSetting = (await getDmSettings(member)).level;

  switch (dmSetting) {
    case "All":
      addNotificationToQueue({ memberId: id, payload: { embed } });
      break;
    case "OnlyReward":
      if (rewardsText.size > 0) addNotificationToQueue({ memberId: id, payload: { embed } });
      else await redis.set(`nypsi:levelup:${id}`, JSON.stringify(embed.toJSON()));
      break;
    case "Disabled":
      await redis.set(`nypsi:levelup:${id}`, JSON.stringify(embed.toJSON()));
      break;
  }
}
