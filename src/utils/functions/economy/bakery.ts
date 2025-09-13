import { BakeryUpgrade } from "#generated/prisma";
import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { getTier, isPremium } from "../premium/premium";
import { percentChance } from "../random";
import { pluralize } from "../string";
import { addProgress } from "./achievements";
import { addEventProgress, EventData, getCurrentEvent } from "./events";
import { getGuildName, getGuildUpgradesByUser } from "./guilds";
import { addInventoryItem, getInventory } from "./inventory";
import { getUpgrades } from "./levelling";
import { isPassive } from "./passive";
import { addStat } from "./stats";
import { addTaskProgress } from "./tasks";
import { getBakeryUpgradesData, getItems, getUpgradesData } from "./utils";
import ms = require("ms");

async function getLastBake(member: MemberResolvable) {
  const userId = getUserId(member);

  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      lastBake: true,
    },
  });

  return query.lastBake;
}

export async function addBakeryUpgrade(member: MemberResolvable, itemId: string, amount = 1) {
  const userId = getUserId(member);

  await prisma.bakeryUpgrade.upsert({
    where: {
      userId_upgradeId: {
        userId,
        upgradeId: itemId,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      userId,
      upgradeId: itemId,
      amount: amount,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${userId}`);
}

export async function getBakeryUpgrades(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${userId}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.BAKERY_UPGRADES}:${userId}`),
    ) as BakeryUpgrade[];
  }

  const query = await prisma.bakeryUpgrade.findMany({
    where: {
      userId,
    },
    orderBy: {
      upgradeId: "asc",
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.BAKERY_UPGRADES}:${userId}`,
    JSON.stringify(query),
    "EX",
    ms("3 hour") / 1000,
  );

  return query;
}

async function getMaxAfkHours(member: MemberResolvable) {
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
        addStat(member, "bake-grandma", amount);
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
      addStat(member, "bake-guild", Math.floor(total / 2));
    }
  }

  if ((await inventory.hasGem("crystal_heart")).any) {
    if (percentChance(5)) {
      total = total * 2;
      earned.set("crystal_heart", Math.floor(total / 2));
      addStat(member, "bake-heart", Math.floor(total / 2));
    }
  } else if ((await inventory.hasGem("white_gem")).any) {
    if (percentChance(2)) {
      total = total * 2;
      earned.set("white_gem", Math.floor(total / 2));
      addStat(member, "bake-white", Math.floor(total / 2));
    }
  } else if ((await inventory.hasGem("purple_gem")).any) {
    if (percentChance(0.5)) {
      total = total * 2;
      earned.set("purple_gem", Math.floor(total / 2));
      addStat(member, "bake-purple", Math.floor(total / 2));
    }
  } else if ((await inventory.hasGem("blue_gem")).any) {
    if (percentChance(0.1)) {
      total = total * 2;
      earned.set("blue_gem", Math.floor(total / 2));
      addStat(member, "bake-blue", Math.floor(total / 2));
    }
  }

  while (percentChance(cakeChance > 25 ? 25 : cakeChance)) cakeAmount++;

  await addInventoryItem(member, "cookie", Math.round(total));
  addStat(member, "bake-total", Math.round(total));

  if (cakeAmount > 0) {
    await addInventoryItem(member, "cake", cakeAmount);
    addStat(member, "bake-cake", cakeAmount);
  }

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
      } baked ${earned.get(upgradeId).toLocaleString()} ${pluralize("cookie", earned.get(upgradeId))}`,
    );
  }

  if (cakeAmount > 0) {
    embed.setDescription(
      `you baked **${Math.round(total).toLocaleString()}** ${pluralize("cookie", total)} 🍪 and **${cakeAmount.toLocaleString()}** ${pluralize("cake", cakeAmount)} ${
        getItems()["cake"].emoji
      } !!`,
    );
  } else {
    embed.setDescription(
      `you baked **${Math.round(total).toLocaleString()}** ${pluralize("cookie", total)} 🍪 !!`,
    );
  }

  if (breakdownDesc.length > 0) {
    embed.addField("stats", breakdownDesc.join("\n"));
  }

  const eventProgress = await addEventProgress(
    member.client as NypsiClient,
    member,
    "cookies",
    Math.round(total),
  );

  if (eventProgress) {
    const eventData: { event?: EventData; target: number } = { target: 0 };

    eventData.event = await getCurrentEvent();

    if (eventData.event) {
      eventData.target = Number(eventData.event.target);
    }

    embed.addField(
      "event progress",
      `🔱 ${eventProgress.toLocaleString()}/${eventData.target.toLocaleString()}`,
    );
  }

  addProgress(member.user.id, "baker", Math.round(total));
  addProgress(member.user.id, "super_baker", Math.round(total));
  addTaskProgress(member.user.id, "bake_daily", Math.round(total));
  addTaskProgress(member.user.id, "bake_weekly", Math.round(total));

  return embed;
}
