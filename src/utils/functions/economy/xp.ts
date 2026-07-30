import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { isBooster } from "../premium/boosters";
import { getTier } from "../premium/premium";
import { calcMaxBet, getRequiredBetForXp } from "./balance";
import { getBoosters } from "./boosters";
import { gemBreak, getInventory } from "./inventory";
import { doLevelUp, getRawLevel, getUpgrades } from "./levelling";
import { rollPet } from "./pets";
import { getItems, getUpgradesData } from "./utils";

const xpCache = new RedisCache<number>(Constants.redis.cache.economy.XP, 3600);

export async function getXp(member: MemberResolvable): Promise<number> {
  const userId = getUserId(member);

  const cache = await xpCache.get(userId);

  if (cache !== null) return cache;

  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      xp: true,
    },
  });

  await xpCache.set(userId, Number(query.xp));

  return Number(query.xp);
}

export async function updateXp(member: MemberResolvable, amount: number, check = true) {
  const userId = getUserId(member);

  await prisma.economy.update({
    where: {
      userId,
    },
    data: {
      xp: amount,
    },
  });
  await xpCache.delete(userId);

  if (check) doLevelUp(member);
}

export async function addXp(member: MemberResolvable, amount: number, check = true) {
  const userId = getUserId(member);

  const query = await prisma.economy.update({
    where: {
      userId,
    },
    data: {
      xp: { increment: amount },
    },
    select: {
      xp: true,
    },
  });
  await xpCache.set(userId, Number(query.xp));

  if (check) doLevelUp(member);
}

export async function removeXp(member: MemberResolvable, amount: number, check = true) {
  const userId = getUserId(member);

  const query = await prisma.economy.update({
    where: {
      userId,
    },
    data: {
      xp: { decrement: amount },
    },
    select: {
      xp: true,
    },
  });
  await xpCache.set(userId, Number(query.xp));

  if (check) doLevelUp(member);
}

export async function getXpBonus(member: MemberResolvable, client: NypsiClient, guildId: string) {
  let min = 5;
  const baseBreakdown = new Map<string, number>();
  const multiplierBreakdown = new Map<string, number>();

  const [inventory, tier, booster, boosters, upgrades, rawLevel] = await Promise.all([
    getInventory(member),
    getTier(member),
    isBooster(member),
    getBoosters(member),
    getUpgrades(member),
    getRawLevel(member),
  ]);

  const levelBonus = rawLevel / 20 > 35 ? 35 : rawLevel / 20;
  min += levelBonus;
  if (levelBonus > 0) baseBreakdown.set("level", levelBonus);

  if (booster) {
    min += 5;
    baseBreakdown.set("booster", 5);
  }

  if (tier) {
    const premiumBonus = tier * 2.7;
    min += premiumBonus;
    baseBreakdown.set("premium", premiumBonus);
  }

  const beforeGems = min;

  if ((await inventory.hasGem("crystal_heart")).any) min += Math.floor(Math.random() * 10);
  if ((await inventory.hasGem("white_gem")).any) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2) {
      min -= Math.floor(Math.random() * 7);
    } else {
      gemBreak(member, 0.007, "white_gem", client);
      min += Math.floor(Math.random() * 17) + 1;
    }
  }

  if (min !== beforeGems) baseBreakdown.set("gems", min - beforeGems);

  const max = min * 1.3;
  let boosterEffect = 0;

  const items = getItems();

  const xpUpgrade = upgrades.find((i) => i.upgradeId === "xp");

  if (xpUpgrade) {
    const upgradeBonus = xpUpgrade.amount * getUpgradesData()["xp"].effect;
    boosterEffect += upgradeBonus;
    multiplierBreakdown.set("upgrades", upgradeBonus * 100);
  }

  if (guildId === Constants.NYPSI_SERVER_ID) {
    boosterEffect += 0.075;
    multiplierBreakdown.set("nypsi discord", 7.5);
  }

  const beforeBoosters = boosterEffect;

  for (const boosterId of boosters.keys()) {
    if (boosterId == "beginner_booster") {
      boosterEffect += 1;
    } else if (items[boosterId].boosterEffect.boosts.includes("xp")) {
      boosterEffect += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  if (boosterEffect !== beforeBoosters)
    multiplierBreakdown.set("boosters", (boosterEffect - beforeBoosters) * 100);

  const petBonus = await rollPet(member, "xp");
  if (petBonus) {
    boosterEffect += petBonus;
    multiplierBreakdown.set("eagle", petBonus * 100);
  }

  return {
    min,
    max,
    boosterEffect,
    baseBreakdown,
    multiplierBreakdown,
    rawLevel,
  };
}

export async function calcEarnedGambleXp(
  member: MemberResolvable,
  client: NypsiClient,
  bet: number,
  multiplier: number,
  guildId: string,
): Promise<number> {
  if (await redis.exists(Constants.redis.nypsi.INFINITE_MAX_BET)) return 0;

  const requiredBet = await getRequiredBetForXp(member);

  if (bet < requiredBet) {
    return 0;
  }

  let { min, boosterEffect, rawLevel } = await getXpBonus(member, client, guildId);
  const maxBet = await calcMaxBet(member);

  let maxBetAdjusted = maxBet;

  if (rawLevel < 100) {
    maxBetAdjusted = maxBetAdjusted * 0.05;
  } else if (rawLevel < 200) {
    maxBetAdjusted = maxBetAdjusted * 0.1;
  } else if (rawLevel < 300) {
    maxBetAdjusted = maxBetAdjusted * 0.15;
  } else if (rawLevel < 400) {
    maxBetAdjusted = maxBetAdjusted * 0.2;
  } else if (rawLevel < 500) {
    maxBetAdjusted = maxBetAdjusted * 0.25;
  } else if (rawLevel < 750) {
    maxBetAdjusted = maxBetAdjusted * 0.5;
  } else if (rawLevel < 1000) {
    maxBetAdjusted = maxBetAdjusted * 0.75;
  }

  let percentageOfMaxBet = bet / (maxBetAdjusted * 0.25);
  if (percentageOfMaxBet < 0.25) percentageOfMaxBet = 0.25;

  if (percentageOfMaxBet > 1.2) percentageOfMaxBet = 1.2;

  min = min * percentageOfMaxBet;

  min = min * (multiplier * 0.7);

  const max = min * 1.3;

  let earned = Math.floor(Math.random() * (max - min)) + min;

  if (min > earned) earned = min;

  earned += boosterEffect * earned;

  if (earned < 0) earned = 0;

  return Math.floor(earned);
}

export async function calcEarnedHFMXp(member: GuildMember, items: number, guildId: string) {
  let min = 0;

  if (items > 30) {
    min += Math.random() * 15 + 15;
    items -= 30;

    min += items * 0.369;
  } else {
    min += Math.random() * (items / 2) + items / 2;
  }

  min *= 1.369;

  const xpBonus = await getXpBonus(member, member.client as NypsiClient, guildId);

  let max = min + xpBonus.rawLevel / 50 > 30 ? 30 : xpBonus.rawLevel / 50;

  if (max < 15) max = 15;

  min *= 1 + Math.log2(1 + xpBonus.min / 5) / 200;
  max *= 1 + Math.log2(1 + xpBonus.max / 6.5) / 200;

  let earned = Math.random() * (max - min) + min;

  earned += xpBonus.boosterEffect * earned;

  return Math.floor(earned);
}
