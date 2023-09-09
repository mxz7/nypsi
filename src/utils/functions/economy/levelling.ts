import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addKarma } from "../karma/karma";
import sleep from "../sleep";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getBalance, getBankBalance, updateBalance, updateBankBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { getXp, updateXp } from "./xp";
import ms = require("ms");

const levellingRewards = new Map<number, { text: string; rewards?: string[] }>();

levellingRewards.set(1, {
  text:
    "congratulations on your first level up and welcome to nypsi!!\ndon't forget to </vote:1014905682341924944> daily for rewards\n\n" +
    "you have received:\n" +
    "- `1x` 📦 basic crate\n" +
    "- 🔮 50 karma\n" +
    "- $30,000",
  rewards: ["id:basic_crate", "karma:50", "money:30000"],
});
levellingRewards.set(3, {
  text:
    "congratulations on level 3!! it's about time we teach you about workers\n\n" +
    "workers fill up their capacity in the background, whether you're using nypsi or not. when workers are full, you can use </workers claim:1014905682341924945> to empty their inventory and earn money.\n" +
    "the quarry worker sometimes finds *scraps* and *shards*, which can be used to craft gems and worker upgrades\n\n" +
    "you have unlocked:\n" +
    "- 🪨 quarry worker (</workers view:1014905682341924945>)",
});
levellingRewards.set(5, { text: "you will now receive 2 📦 vote crates when voting" });
levellingRewards.set(7, {
  text:
    "just a little bonus for my favourite number 😁\n\nyou have received:\n" +
    "- `1x` 📦 basic crate\n" +
    "- `$100,000`",
  rewards: ["id:basic_crate", "money:100000"],
});
levellingRewards.set(10, {
  text:
    "you're making *very* good progress. keep it up!!\n\nyou have received:\n" +
    "- `2x` 📦 basic crate\n" +
    "- 🔮 100 karma\n" +
    "- $100,000\n\n" +
    "you have unlocked:\n" +
    "- 🥔 potato farmer (</workers view:1014905682341924945>)\n" +
    "- +1% gamble multi",
  rewards: ["id:basic_crate", "id:basic_crate", "karma:100", "money:100000"],
});
levellingRewards.set(15, { text: "you will now receive 3 📦 vote crates when voting" });
levellingRewards.set(25, {
  text: "you have unlocked:\n" + "- 🎣 fisherman (</workers view:1014905682341924945>)",
});
levellingRewards.set(30, { text: "you will now receive 4 📦 vote crates when voting" });
levellingRewards.set(40, {
  text:
    "you will now receive 4 📦 vote crates when voting\n\nyou have unlocked:\n" +
    "- 🍟 mcdonalds (</workers view:1014905682341924945>)",
});
levellingRewards.set(50, {
  text:
    "you will now receive 5 📦 vote crates when voting\n\nyou have unlocked:\n" +
    "- ⛏️ miner (</workers view:1014905682341924945>)\n" +
    "- 🪓 lumberjack (</workers view:1014905682341924945>)\n" +
    "- 🥓 butcher (</workers view:1014905682341924945>)\n" +
    "- +1% gamble multi",
});
levellingRewards.set(69, {
  text: "hahaaaaahaha......\n\nyou have received:\n" + "- `3x` 🎁 69420 crate",
  rewards: ["id:69420_crate", "id:69420_crate", "id:69420_crate"],
});
levellingRewards.set(75, {
  text:
    "you have unlocked:\n" +
    "- 👕 tailor (</workers view:1014905682341924945>)\n" +
    "- +1% gamble multi",
});
levellingRewards.set(100, {
  text:
    "you have unlocked:\n" +
    "- 🚀 spacex (</workers view:1014905682341924945>)\n" +
    "- 📦 amazon (</workers view:1014905682341924945>)\n" +
    "- create your own guild\n" +
    "- +1% gamble multi",
});
levellingRewards.set(200, {
  text: "you have unlocked:\n" + "- +1% gamble multi",
});
levellingRewards.set(250, {
  text: "you have unlocked:\n" + "- +1% gamble multi",
});

const xpFormula = (level: number, prestige: number) =>
  Math.floor(Math.pow(level + 1, 1.117 + 0.07 * prestige) + 100 + 15 * prestige) - 1;
const moneyFormula = (level: number, prestige: number) =>
  Math.floor(Math.pow(level + 1, 2.5 + 0.17 * prestige) + 25_000 + 5_000 * prestige) - 1;

export async function getPrestige(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.PRESTIGE}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.PRESTIGE}:${id}`));
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

  if (await redis.exists(`${Constants.redis.cache.economy.LEVEL}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.LEVEL}:${id}`));
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
  await redis.expire(`${Constants.redis.cache.economy.LEVEL}:${id}`, ms("1 hour") / 1000);

  return query.level;
}

export async function getRawLevel(member: GuildMember | string) {
  let [level, prestige] = await Promise.all([getLevel(member), getPrestige(member)]);

  while (prestige > 0) {
    prestige--;
    level += 100;
  }

  return level;
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

export async function getLevelRequirements(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let [prestige, level] = await Promise.all([getPrestige(id), getLevel(id)]);

  while (level > 100) {
    prestige++;
    level -= 100;
  }

  const requiredXp = xpFormula(level, prestige);
  const requiredMoney = moneyFormula(level, prestige);

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

export async function checkLevelUp(member: GuildMember | string) {
  const [xp, bank, requirements] = await Promise.all([
    getXp(member),
    getBankBalance(member),
    getLevelRequirements(member),
  ]);

  if (requirements.money <= bank && requirements.xp <= xp) {
    await doLevelUp(member, requirements);
    return true;
  }

  return false;
}

async function doLevelUp(
  member: GuildMember | string,
  requirements: { money: number; xp: number },
) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const level = await setLevel(member, (await getLevel(member)) + 1);
  const prestige = await getPrestige(member);

  await updateXp(member, (await getXp(member)) - requirements.xp, false);
  await updateBankBalance(member, (await getBankBalance(member)) - requirements.money, false);

  const rawLevel = await getRawLevel(member);

  const levelData = levellingRewards.get(rawLevel);

  logger.info(`${id} levelled up to ${rawLevel} (P${prestige}L${level})`);

  if (levelData?.rewards)
    for (const reward of levelData.rewards) {
      if (reward.startsWith("id:")) {
        await addInventoryItem(member, reward.substring(3), 1, false);
      } else if (reward.startsWith("money:")) {
        await updateBalance(member, (await getBalance(member)) + parseInt(reward.substring(6)));
      } else if (reward.startsWith("karma:")) {
        await addKarma(member, parseInt(reward.substring(6)));
      }
    }

  const embed = new CustomEmbed(member instanceof GuildMember ? member : null)
    .setHeader(
      "level up",
      member instanceof GuildMember
        ? member.user.avatarURL()
        : (await prisma.user.findUnique({ where: { id }, select: { avatar: true } })).avatar,
    )
    .setDescription(
      `you are now ${prestige > 0 ? `**P${prestige} L${level}**` : `level **${level}**`}${
        levelData?.text ? `\n\n${levelData.text}` : ""
      }`,
    );

  const dmSetting = (await getDmSettings(member)).level;

  switch (dmSetting) {
    case "All":
      addNotificationToQueue({ memberId: id, payload: { embed } });
      break;
    case "OnlyReward":
      if (levelData) addNotificationToQueue({ memberId: id, payload: { embed } });
      else await redis.set(`nypsi:levelup:${id}`, JSON.stringify(embed.toJSON()));
      break;
    case "Disabled":
      await redis.set(`nypsi:levelup:${id}`, JSON.stringify(embed.toJSON()));
      break;
  }

  await sleep(100);

  return await checkLevelUp(member);
}
