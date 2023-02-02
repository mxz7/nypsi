import { BakeryUpgrade } from "@prisma/client";
import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getTier, isPremium } from "../premium/premium";
import { addProgress } from "./achievements";
import { addInventoryItem, getInventory } from "./inventory";
import { isPassive } from "./passive";
import { getBakeryUpgradesData } from "./utils";
import ms = require("ms");

async function getLastBake(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      lastBake: true,
    },
  });

  return query.lastBake;
}

export async function addBakeryUpgrade(member: GuildMember | string, itemId: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.bakeryUpgrade.upsert({
    where: {
      userId_upgradeId: {
        userId: id,
        upgradeId: itemId,
      },
    },
    update: {
      amount: { increment: 1 },
    },
    create: {
      userId: id,
      upgradeId: itemId,
      amount: 1,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`);
}

export async function getBakeryUpgrades(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`)) as BakeryUpgrade[];
  }

  const query = await prisma.bakeryUpgrade.findMany({
    where: {
      userId: id,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`, Math.floor(ms("1 hour") / 1000));

  return query;
}

async function getMaxAfkHours(member: GuildMember | string) {
  let max = 2;

  if (await isPremium(member)) {
    max += 1;
  }

  const upgrades = await getBakeryUpgrades(member).then((u) =>
    u.filter((i) => getBakeryUpgradesData()[i.upgradeId].upgrades === "maxafk")
  );

  for (const upgrade of upgrades) {
    max += getBakeryUpgradesData()[upgrade.upgradeId].value * upgrade.amount;
  }

  return max;
}

export async function runBakery(member: GuildMember) {
  const lastBaked = await getLastBake(member);
  const upgrades = await getBakeryUpgrades(member);
  const maxAfkHours = await getMaxAfkHours(member);
  const inventory = await getInventory(member);

  let passive = 0;
  const click = [1, 3];

  if (await isPremium(member)) {
    click[1] += await getTier(member);
  }

  if (inventory.find((i) => i.item === "blue_gem")?.amount > 0) click[1] += Math.floor(Math.random() * 7);
  if (inventory.find((i) => i.item === "white_gem")?.amount > 0) click[0] += Math.floor(Math.random() * 3);
  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0) click[0] += Math.floor(Math.random() * 5);

  const diffMs = Date.now() - lastBaked.getTime();

  let diffHours = diffMs / 3.6e6;

  if (diffHours > maxAfkHours) diffHours = maxAfkHours;
  if (diffHours < 0) diffHours = 0;

  const earned = new Map<string, number>();

  for (const upgrade of upgrades) {
    if (getBakeryUpgradesData()[upgrade.upgradeId].upgrades === "hourly") {
      const amount = Math.round(upgrade.amount * getBakeryUpgradesData()[upgrade.upgradeId].value * diffHours);

      passive += amount;

      if (amount > 0) {
        earned.set(upgrade.upgradeId, amount);
      }
    } else if (getBakeryUpgradesData()[upgrade.upgradeId].upgrades === "bake") {
      click[1] += upgrade.amount * getBakeryUpgradesData()[upgrade.upgradeId].value;
    }
  }

  if (await isPassive(member)) {
    click[1] -= 2;

    if (click[1] > 10) click[1] -= 5;
    if (click[1] > 30) click[1] -= 5;
    if (click[1] > 50) click[1] -= 5;
    if (click[1] > 100) click[1] *= 0.75;
    if (click[1] > 100) click[1] -= 10;
  }

  if (passive > 0) {
    await prisma.economy.update({
      where: {
        userId: member.user.id,
      },
      data: {
        lastBake: new Date(),
      },
    });
  }

  let chosenAmount: number;

  if (click[0] >= click[1]) {
    chosenAmount = click[1];
  } else {
    chosenAmount = Math.floor(Math.random() * (click[1] - click[0])) + click[0];
  }

  await addInventoryItem(member, "cookie", chosenAmount + passive);

  const embed = new CustomEmbed(member).setHeader(`${member.user.username}'s bakery`, member.user.avatarURL());

  const earnedIds = Array.from(earned.keys());
  inPlaceSort(earnedIds).desc((i) => earned.get(i));
  const breakdownDesc: string[] = [];

  for (const upgradeId of earnedIds) {
    breakdownDesc.push(
      `${getBakeryUpgradesData()[upgradeId].emoji} ${getBakeryUpgradesData()[upgradeId].name} baked ${earned
        .get(upgradeId)
        .toLocaleString()} cookie${earned.get(upgradeId) > 1 ? "s" : ""}`
    );
  }

  embed.setDescription(
    `you baked **${(chosenAmount + passive).toLocaleString()}** cookie${chosenAmount + passive > 1 ? "s" : ""}!! 🍪`
  );

  if (breakdownDesc.length > 0) {
    embed.addField("stats", breakdownDesc.join("\n"));
  }

  addProgress(member.user.id, "baker", Math.round(chosenAmount + passive));

  return embed;
}
