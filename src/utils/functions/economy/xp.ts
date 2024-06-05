import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { isBooster } from "../premium/boosters";
import { getTier } from "../premium/premium";
import { getRequiredBetForXp } from "./balance";
import { getBoosters } from "./boosters";
import { gemBreak, getInventory } from "./inventory";
import { checkLevelUp, getRawLevel, getUpgrades } from "./levelling";
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

  if (check) checkLevelUp(member);
}

export async function calcEarnedGambleXp(
  member: GuildMember,
  bet: number,
  multiplier: number,
): Promise<number> {
  const requiredBet = await getRequiredBetForXp(member);

  if (await redis.exists("nypsi:infinitemaxbet")) bet = 0;

  if (bet < requiredBet) {
    return 0;
  }

  let min = 1;
  let max = 5;

  const [inventory, tier, booster, boosters, upgrades, rawLevel] = await Promise.all([
    getInventory(member),
    getTier(member),
    isBooster(member.user.id),
    getBoosters(member),
    getUpgrades(member),
    getRawLevel(member),
  ]);

  max += rawLevel / 15 > 75 ? 75 : rawLevel / 15;

  if (booster) max += 7;
  if (tier) max += tier * 2.7;

  let betDivisor = 6000 * (rawLevel / 15) + 10_000;

  if (betDivisor > 100_000) betDivisor = 100_000;
  if (betDivisor < 20_000) betDivisor = 20_000;

  max += bet / betDivisor;
  max += multiplier * 2.5;

  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0)
    max += Math.floor(Math.random() * 10);
  if (inventory.find((i) => i.item == "white_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2) {
      max -= Math.floor(Math.random() * 7) + 1;
    } else {
      gemBreak(member.user.id, 0.007, "white_gem");
      max += Math.floor(Math.random() * 17) + 1;
    }
  }

  if (min < max * 0.3) min = max * 0.3;

  let earned = Math.floor(Math.random() * (max - min)) + min;

  if (min > max) earned = max;

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

  const [boosters, level] = await Promise.all([getBoosters(member), getRawLevel(member)]);

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

  earned += boosterEffect * earned;

  return Math.floor(earned);
}
