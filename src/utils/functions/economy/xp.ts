import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { getRequiredBetForXp } from "./balance";
import { getBoosters } from "./boosters";
import { getGuildByUser } from "./guilds";
import { getPrestige } from "./prestige";
import { getItems } from "./utils";

export async function getXp(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:economy:xp:${id}`)) {
    return parseInt(await redis.get(`cache:economy:xp:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      xp: true,
    },
  });

  await redis.set(`cache:economy:xp:${id}`, query.xp);
  await redis.expire(`cache:economy:xp:${id}`, 30);

  return query.xp;
}

export async function updateXp(member: GuildMember, amount: number) {
  if (amount >= 69420) return;

  await prisma.economy.update({
    where: {
      userId: member.user.id,
    },
    data: {
      xp: amount,
    },
  });
  await redis.del(`cache:economy:xp:${member.user.id}`);
}

export async function calcMinimumEarnedXp(member: GuildMember): Promise<number> {
  let earned = 1;
  earned += (await getPrestige(member)) / 1.5;

  let max = 6;

  const guild = await getGuildByUser(member);

  if (guild) {
    max += guild.level - 1;
  }

  if (earned > max) earned = max;

  return Math.floor(earned);
}

export async function calcEarnedXp(member: GuildMember, bet: number): Promise<number> {
  const requiredBet = await getRequiredBetForXp(member);

  if (bet < requiredBet) {
    return 0;
  }

  let earned = await calcMinimumEarnedXp(member);

  const random = Math.floor(Math.random() * 3);

  earned += random;

  let max = 6;

  const guild = await getGuildByUser(member);

  if (guild) {
    max += guild.level - 1;
  }

  if (earned > max) earned = max;

  const boosters = await getBoosters(member);

  let boosterEffect = 0;

  const items = getItems();

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].boosterEffect.boosts.includes("xp")) {
      boosterEffect += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  earned += boosterEffect * earned;

  return Math.floor(earned);
}
