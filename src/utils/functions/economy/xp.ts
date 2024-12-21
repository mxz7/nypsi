import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { isBooster } from "../premium/boosters";
import { getTier } from "../premium/premium";
import { calcMaxBet, getRequiredBetForXp } from "./balance";
import { getBoosters } from "./boosters";
import { gemBreak, getInventory } from "./inventory";
import { doLevelUp, getRawLevel, getUpgrades } from "./levelling";
import { getItems, getUpgradesData } from "./utils";

export async function getXp(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.XP}:${id}`);

  if (cache) {
    return parseInt(cache);
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      xp: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.XP}:${id}`, query.xp.toString(), "EX", 3600);

  return Number(query.xp);
}

export async function updateXp(member: GuildMember | string, amount: number, check = true) {
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
      xp: amount,
    },
  });
  await redis.del(`${Constants.redis.cache.economy.XP}:${id}`);

  if (check) doLevelUp(member);
}

export async function addXp(member: GuildMember | string, amount: number, check = true) {
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
      xp: { increment: amount },
    },
    select: {
      xp: true,
    },
  });
  await redis.set(`${Constants.redis.cache.economy.XP}:${id}`, query.xp.toString(), "EX", 3600);

  if (check) doLevelUp(member);
}

export async function removeXp(member: GuildMember | string, amount: number, check = true) {
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
      xp: { decrement: amount },
    },
    select: {
      xp: true,
    },
  });
  await redis.set(`${Constants.redis.cache.economy.XP}:${id}`, query.xp.toString(), "EX", 3600);

  if (check) doLevelUp(member);
}

export async function calcEarnedGambleXp(
  member: GuildMember | string,
  bet: number,
  multiplier: number,
): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }
  if (await redis.exists("nypsi:infinitemaxbet")) return 0;

  const requiredBet = await getRequiredBetForXp(member);

  if (bet < requiredBet) {
    return 0;
  }

  let min = 5;

  const [inventory, tier, booster, boosters, upgrades, rawLevel, maxBet] = await Promise.all([
    getInventory(member),
    getTier(member),
    isBooster(id),
    getBoosters(member),
    getUpgrades(member),
    getRawLevel(member),
    calcMaxBet(member),
  ]);

  min += rawLevel / 20 > 35 ? 35 : rawLevel / 20;

  if (booster) min += 5;
  if (tier) min += tier * 2.7;

  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0)
    min += Math.floor(Math.random() * 10);
  if (inventory.find((i) => i.item == "white_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2) {
      min -= Math.floor(Math.random() * 7);
    } else {
      gemBreak(id, 0.007, "white_gem");
      min += Math.floor(Math.random() * 17) + 1;
    }
  }

  let maxBetAdjusted = maxBet;

  if (rawLevel < 500) {
    maxBetAdjusted = maxBetAdjusted * 0.25;
  } else if (rawLevel < 750) {
    maxBetAdjusted = maxBetAdjusted * 0.5;
  } else if (rawLevel < 1000) {
    maxBetAdjusted = maxBetAdjusted * 0.75;
  }

  let percentageOfMaxBet = bet / (maxBetAdjusted * 0.25);
  if (percentageOfMaxBet < 0.25) percentageOfMaxBet = 0.25;
  min = min * percentageOfMaxBet;

  min = min * (multiplier * 0.7);

  const max = min * 1.3;

  let earned = Math.floor(Math.random() * (max - min)) + min;

  if (min > earned) earned = min;

  let boosterEffect = 0;

  const items = getItems();

  if (upgrades.find((i) => i.upgradeId === "xp"))
    boosterEffect +=
      upgrades.find((i) => i.upgradeId === "xp").amount * getUpgradesData()["xp"].effect;

  for (const boosterId of boosters.keys()) {
    if (boosterId == "beginner_booster") {
      boosterEffect += 1;
    } else if (items[boosterId].boosterEffect.boosts.includes("xp")) {
      boosterEffect += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  earned += boosterEffect * earned;

  if (earned < 0) earned = 0;

  return Math.floor(earned);
}

export async function calcEarnedHFMXp(member: GuildMember, items: number) {
  let min = 0;

  if (items > 30) {
    min += Math.random() * 15 + 15;
    items -= 30;

    min += items * 0.369;
  } else {
    min += Math.random() * (items / 2) + items / 2;
  }

  min *= 1.369;

  const [boosters, level, upgrades] = await Promise.all([
    getBoosters(member),
    getRawLevel(member),
    getUpgrades(member),
  ]);

  const max = min + level / 50 > 30 ? 30 : level / 50;

  let earned = Math.random() * (max - min) + min;

  let boosterEffect = 0;

  for (const boosterId of boosters.keys()) {
    if (boosterId == "beginner_booster") {
      boosterEffect += 1;
    } else if (getItems()[boosterId].boosterEffect.boosts.includes("xp")) {
      boosterEffect += getItems()[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  if (upgrades.find((i) => i.upgradeId === "xp"))
    boosterEffect +=
      upgrades.find((i) => i.upgradeId === "xp").amount * getUpgradesData()["xp"].effect;

  earned += boosterEffect * earned;

  return Math.floor(earned);
}
