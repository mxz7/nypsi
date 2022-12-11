import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getRequiredBetForXp } from "./balance";
import { getBoosters } from "./boosters";
import { getGuildByUser } from "./guilds";
import { gemBreak, getInventory } from "./inventory";
import { getPrestige } from "./prestige";
import { getItems } from "./utils";

export async function getXp(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.XP}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.XP}:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      xp: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.XP}:${id}`, query.xp);
  await redis.expire(`${Constants.redis.cache.economy.XP}:${id}`, 30);

  return query.xp;
}

export async function updateXp(member: GuildMember | string, amount: number) {
  if (amount >= 69420) return;

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
}

export async function calcMinimumEarnedXp(member: GuildMember): Promise<number> {
  let earned = 1;
  earned += (await getPrestige(member)) / 1.79; // i dont like 8

  let max = 10;

  const guild = await getGuildByUser(member);
  const inventory = await getInventory(member);

  if (guild) {
    max += guild.level > 10 ? 10 : guild.level - 1;
  }

  if (inventory.find((i) => i.item == "white_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2) {
      max -= 2;
    } else {
      gemBreak(member.user.id, 0.007, "white_gem");
      max += 7;
    }
  } else if (inventory.find((i) => i.item == "pink_gem")?.amount > 0) {
    gemBreak(member.user.id, 0.07, "pink_gem");
    max += 1;
  }

  if (earned > max) earned = max;
  if (earned < 0) earned = 0;

  return Math.floor(earned);
}

export async function calcEarnedXp(member: GuildMember, bet: number): Promise<number> {
  const requiredBet = await getRequiredBetForXp(member);

  if (bet < requiredBet) {
    return 0;
  }

  let earned = await calcMinimumEarnedXp(member);

  const random = Math.floor(Math.random() * 4);

  earned += random;

  const boosters = await getBoosters(member);

  let boosterEffect = 0;

  const items = getItems();

  for (const boosterId of boosters.keys()) {
    if (boosterId == "beginner_booster") {
      boosterEffect += 1;
    } else if (items[boosterId].boosterEffect.boosts.includes("xp")) {
      boosterEffect += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  earned += boosterEffect * earned;

  return Math.floor(earned);
}
