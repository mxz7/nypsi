import { BakeryUpgrade } from "@prisma/client";
import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getTier, isPremium } from "../premium/premium";
import { percentChance } from "../random";
import { addProgress } from "./achievements";
import { getGuildName, getGuildUpgradesByUser } from "./guilds";
import { addInventoryItem, getInventory } from "./inventory";
import { getUpgrades } from "./levelling";
import { isPassive } from "./passive";
import { addTaskProgress } from "./tasks";
import { getBakeryUpgradesData, getItems, getUpgradesData } from "./utils";
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

export async function addBakeryUpgrade(member: GuildMember | string, itemId: string, amount = 1) {
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
      amount: { increment: amount },
    },
    create: {
      userId: id,
      upgradeId: itemId,
      amount: amount,
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
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`),
    ) as BakeryUpgrade[];
  }

  const query = await prisma.bakeryUpgrade.findMany({
    where: {
      userId: id,
    },
    orderBy: {
      upgradeId: "asc",
    },
  });

  await redis.set(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`, JSON.stringify(query));
  await redis.expire(
    `${Constants.redis.cache.economy.BAKERY_UPGRADES}:${id}`,
    Math.floor(ms("1 hour") / 1000),
  );

  return query;
}

async function getMaxAfkHours(member: GuildMember | string) {
  let max = 1;

  if (await isPremium(member)) {
    max += 1;
  }

  const upgrades = await getBakeryUpgrades(member).then((u) =>
    u.filter((i) => getBakeryUpgradesData()[i.upgradeId].upgrades === "maxafk"),
  );

  for (const upgrade of upgrades) {
    max += getBakeryUpgradesData()[upgrade.upgradeId].value * upgrade.amount;
  }

  return max;
}

export async function runBakery(member: GuildMember) {
  const [lastBaked, upgrades, maxAfkHours, inventory, guildUpgrades, tier, userUpgrades] =
    await Promise.all([
      getLastBake(member),
      getBakeryUpgrades(member),
      getMaxAfkHours(member),
      getInventory(member),
      getGuildUpgradesByUser(member),
      getTier(member),
      getUpgrades(member),
    ]);

  let passive = 0;
  let cakeChance = 0;
  const click = [1, 3];

  click[1] += tier;

  const diffMs = Date.now() - lastBaked.getTime();

  let diffHours = diffMs / 3.6e6;

  if (diffHours > maxAfkHours) diffHours = maxAfkHours;
  if (diffHours < 0) diffHours = 0;

  const earned = new Map<string, number>();

  for (const upgrade of upgrades) {
    if (getBakeryUpgradesData()[upgrade.upgradeId].upgrades === "hourly") {
      const amount = Math.round(
        upgrade.amount *
          (userUpgrades.find((i) => i.upgradeId === "grandma") && upgrade.upgradeId === "grandma"
            ? getBakeryUpgradesData()[upgrade.upgradeId].value +
              userUpgrades.find((i) => i.upgradeId === "grandma").amount *
                getUpgradesData()["grandma"].effect
            : getBakeryUpgradesData()[upgrade.upgradeId].value) *
          diffHours,
      );

      passive += amount;

      if (amount > 0) {
        earned.set(upgrade.upgradeId, amount);
      }
    } else if (getBakeryUpgradesData()[upgrade.upgradeId].upgrades === "bake") {
      if (upgrade.upgradeId === "super_cursor")
        click[0] += Math.floor(
          upgrade.amount *
            (userUpgrades.find((i) => i.upgradeId === "cursor")
              ? getBakeryUpgradesData()[upgrade.upgradeId].value +
                userUpgrades.find((i) => i.upgradeId === "cursor").amount *
                  getUpgradesData()["cursor"].effect
              : getBakeryUpgradesData()[upgrade.upgradeId].value),
        );
      click[1] += Math.floor(
        upgrade.amount *
          (userUpgrades.find((i) => i.upgradeId === "cursor" && upgrade.upgradeId === "cursor")
            ? getBakeryUpgradesData()[upgrade.upgradeId].value +
              userUpgrades.find((i) => i.upgradeId === "cursor").amount *
                getUpgradesData()["cursor"].effect
            : getBakeryUpgradesData()[upgrade.upgradeId].value),
      );
    } else if (getBakeryUpgradesData()[upgrade.upgradeId].upgrades === "cake") {
      cakeChance += upgrade.amount * getBakeryUpgradesData()[upgrade.upgradeId].value;
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
  let cakeAmount = 0;

  if (click[0] >= click[1]) {
    chosenAmount = click[1];
  } else {
    chosenAmount = Math.floor(Math.random() * (click[1] - click[0])) + click[0];
  }

  let total = chosenAmount + passive;

  if (guildUpgrades.find((i) => i.upgradeId === "bakery")) {
    if (percentChance(2 * guildUpgrades.find((i) => i.upgradeId === "bakery").amount)) {
      total = total * 2;
      earned.set("guild", Math.floor(total / 2));
    }
  }

  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0) {
    if (percentChance(5)) {
      total = total * 2;
      earned.set("crystal_heart", Math.floor(total / 2));
    }
  } else if (inventory.find((i) => i.item === "white_gem")?.amount > 0) {
    if (percentChance(2)) {
      total = total * 2;
      earned.set("white_gem", Math.floor(total / 2));
    }
  } else if (inventory.find((i) => i.item === "purple_gem")?.amount > 0) {
    if (percentChance(0.5)) {
      total = total * 2;
      earned.set("purple_gem", Math.floor(total / 2));
    }
  } else if (inventory.find((i) => i.item === "blue_gem")?.amount > 0) {
    if (percentChance(0.1)) {
      total = total * 2;
      earned.set("blue_gem", Math.floor(total / 2));
    }
  }

  while (percentChance(cakeChance > 25 ? 25 : cakeChance)) cakeAmount++;

  await addInventoryItem(member, "cookie", Math.round(total));
  if (cakeAmount > 0) await addInventoryItem(member, "cake", cakeAmount);

  const embed = new CustomEmbed(member).setHeader(
    `${member.user.username}'s bakery`,
    member.user.avatarURL(),
  );

  const earnedIds = Array.from(earned.keys());
  inPlaceSort(earnedIds).desc((i) => earned.get(i));
  const breakdownDesc: string[] = [];

  for (const upgradeId of earnedIds) {
    breakdownDesc.push(
      `${
        (
          getBakeryUpgradesData()[upgradeId] ||
          getItems()[upgradeId] || { emoji: ":busts_in_silhouette:" }
        ).emoji
      } ${
        (
          getBakeryUpgradesData()[upgradeId] ||
          getItems()[upgradeId] || { name: await getGuildName(member) }
        ).name
      } baked ${earned.get(upgradeId).toLocaleString()} cookie${
        earned.get(upgradeId) > 1 ? "s" : ""
      }`,
    );
  }

  if (cakeAmount > 0) {
    embed.setDescription(
      `you baked **${Math.round(total).toLocaleString()}** cookie${
        total > 1 ? "s" : ""
      } 🍪 and **${cakeAmount.toLocaleString()}** cake${cakeAmount > 1 ? "s" : ""} ${
        getItems()["cake"].emoji
      } !!`,
    );
  } else {
    embed.setDescription(
      `you baked **${Math.round(total).toLocaleString()}** cookie${total > 1 ? "s" : ""} 🍪 !!`,
    );
  }

  if (breakdownDesc.length > 0) {
    embed.addField("stats", breakdownDesc.join("\n"));
  }

  addProgress(member.user.id, "baker", Math.round(total));
  addProgress(member.user.id, "super_baker", Math.round(total));
  addTaskProgress(member.user.id, "bake_daily", Math.round(total));
  addTaskProgress(member.user.id, "bake_weekly", Math.round(total));

  return embed;
}
