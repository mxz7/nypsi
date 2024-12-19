import { Collection, Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { isBooster } from "../premium/boosters";
import { getTier } from "../premium/premium";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getAuctionAverage } from "./auctions";
import { getBoosters } from "./boosters";
import { calcCarCost } from "./cars";
import { getClaimable, getFarm, getFarmUpgrades } from "./farm";
import { getGuildUpgradesByUser } from "./guilds";
import { calcItemValue, gemBreak, getInventory } from "./inventory";
import { doLevelUp, getRawLevel, getUpgrades } from "./levelling";
import { getOffersAverage } from "./offers";
import { isPassive } from "./passive";
import { getBaseUpgrades, getBaseWorkers, getItems, getPlantsData, getPlantUpgrades, getUpgradesData } from "./utils";
import { hasVoted } from "./vote";
import { calcWorkerValues } from "./workers";
import ms = require("ms");
import _ = require("lodash");

export async function getBalance(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.BALANCE}:${id}`);

  if (cache) {
    return parseInt(cache);
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      money: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.BALANCE}:${id}`,
    Number(query.money),
    "EX",
    3600,
  );

  return Number(query.money);
}

export async function updateBalance(member: GuildMember | string, amount: number) {
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
      money: Math.floor(amount),
    },
    select: {
      money: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.BALANCE}:${id}`,
    Number(query.money),
    "EX",
    3600,
  );
}

export async function addBalance(member: GuildMember | string, amount: number) {
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
      money: { increment: Math.floor(amount) },
    },
    select: {
      money: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.BALANCE}:${id}`,
    Number(query.money),
    "EX",
    3600,
  );

  return query.money;
}

export async function removeBalance(member: GuildMember | string, amount: number) {
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
      money: { decrement: Math.floor(amount) },
    },
    select: {
      money: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.BALANCE}:${id}`,
    Number(query.money),
    "EX",
    3600,
  );

  return query.money;
}

export async function getBankBalance(member: GuildMember | string): Promise<number> {
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
      bank: true,
    },
  });

  return Number(query.bank);
}

export async function updateBankBalance(
  member: GuildMember | string,
  amount: number,
  check = true,
) {
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
      bank: amount,
    },
  });

  if (check) doLevelUp(member);
}

export async function addBankBalance(member: GuildMember | string, amount: number, check = true) {
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
      bank: { increment: amount },
    },
  });

  if (check) doLevelUp(member);
}

export async function removeBankBalance(
  member: GuildMember | string,
  amount: number,
  check = true,
) {
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
      bank: { decrement: amount },
    },
  });

  if (check) doLevelUp(member);
}

export async function increaseBaseBankStorage(member: GuildMember, amount: number) {
  await prisma.economy.update({
    where: {
      userId: member.user.id,
    },
    data: {
      bankStorage: { increment: amount },
    },
  });
}

export async function getGambleMulti(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let multi = 0;
  const breakdownMap = new Map<string, number>();

  const [
    booster,
    boosters,
    guildUpgrades,
    passive,
    dmSettings,
    inventory,
    tier,
    upgrades,
    rawLevel,
  ] = await Promise.all([
    isBooster(id),
    getBoosters(id),
    getGuildUpgradesByUser(member),
    isPassive(id),
    getDmSettings(id),
    getInventory(id),
    getTier(id),
    getUpgrades(id),
    getRawLevel(id),
  ]);

  let rawLevelModified = rawLevel;
  let levelBonus: number;

  while (typeof levelBonus !== "number") {
    if (Constants.PROGRESSION.MULTI.has(rawLevelModified)) {
      levelBonus = Constants.PROGRESSION.MULTI.get(rawLevelModified);
    } else rawLevelModified--;
  }

  if (levelBonus > 0) {
    multi += levelBonus;
    breakdownMap.set("level", levelBonus);
  }

  switch (tier) {
    case 2:
      multi += 1;
      breakdownMap.set("premium", 1);
      break;
    case 3:
      multi += 2;
      breakdownMap.set("premium", 2);
      break;
    case 4:
      multi += 5;
      breakdownMap.set("premium", 5);
      break;
  }

  if (booster) {
    multi += 2;
    breakdownMap.set("booster", 2);
  }

  const items = getItems();

  if (guildUpgrades.find((i) => i.upgradeId === "multi")) {
    multi += guildUpgrades.find((i) => i.upgradeId === "multi").amount;
    breakdownMap.set("guild", guildUpgrades.find((i) => i.upgradeId === "multi").amount);
  }

  if (upgrades.find((i) => i.upgradeId === "multi")) {
    multi +=
      upgrades.find((i) => i.upgradeId === "multi").amount * getUpgradesData()["multi"].effect;
    breakdownMap.set(
      "upgrades",
      upgrades.find((i) => i.upgradeId === "multi").amount * getUpgradesData()["multi"].effect,
    );
  }

  if (
    dmSettings.voteReminder &&
    !(await redis.sismember(Constants.redis.nypsi.VOTE_REMINDER_RECEIVED, id))
  ) {
    multi += 2;
    breakdownMap.set("vote reminders", 2);
  }

  if (passive) {
    multi -= 3;
    breakdownMap.set("passive", -3);
  }

  const beforeBoosters = multi;

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].boosterEffect.boosts.includes("multi")) {
      multi += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  if (multi - beforeBoosters !== 0) breakdownMap.set("boosters", multi - beforeBoosters);

  const beforeGems = multi;

  let heart = false;

  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0) heart = true;
  if (inventory.find((i) => i.item == "white_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2 && !heart) {
      multi -= Math.floor(Math.random() * 3) + 1;
    } else {
      gemBreak(id, 0.01, "white_gem");
      const choices = [
        7, 3, 4, 5, 7, 2, 17, 7, 4, 5, 3, 3, 3, 4, 3, 3, 3, 2, 2, 2, 7, 7, 7, 7, 7, 7, 7,
      ];
      multi += Math.floor(Math.random() * choices[Math.floor(Math.random() * choices.length)]);
    }
  } else if (inventory.find((i) => i.item == "pink_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2 && !heart) {
      multi -= 3;
    } else {
      gemBreak(id, 0.07, "pink_gem");
      const choices = [7, 5, 4, 3, 2, 1, 3, 1, 1, 1, 3, 3, 2, 2, 2, 3, 3, 4, 4];
      multi += Math.floor(Math.random() * choices[Math.floor(Math.random() * choices.length)]);
    }
  }

  if (multi - beforeGems !== 0) breakdownMap.set("gems", multi - beforeGems);

  multi = Math.floor(multi);
  if (multi < 0) multi = 0;

  multi = multi / 100;

  return { multi: parseFloat(multi.toFixed(2)), breakdown: breakdownMap };
}

export async function getSellMulti(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const [level, tier, booster, boosters, guildUpgrades, passive, inventory, upgrades] =
    await Promise.all([
      getRawLevel(member),
      getTier(member),
      isBooster(id),
      getBoosters(id),
      getGuildUpgradesByUser(member),
      isPassive(member),
      getInventory(member),
      getUpgrades(member),
    ]);

  let multi = 0;
  const breakdown = new Map<string, number>();

  multi += Math.floor(level * 0.0869);

  if (multi > 75) multi = 75;

  if (multi > 0) breakdown.set("level", Math.floor(multi));

  switch (tier) {
    case 1:
      multi += 2;
      breakdown.set("premium", 2);
      break;
    case 2:
      multi += 5;
      breakdown.set("premium", 5);
      break;
    case 3:
      multi += 10;
      breakdown.set("premium", 10);
      break;
    case 4:
      multi += 15;
      breakdown.set("premium", 15);
      break;
  }

  if (booster) {
    multi += 3;
    breakdown.set("booster", 3);
  }

  const items = getItems();

  if (guildUpgrades.find((i) => i.upgradeId === "sellmulti")) {
    multi += guildUpgrades.find((i) => i.upgradeId === "sellmulti").amount * 5;
    breakdown.set("guild", guildUpgrades.find((i) => i.upgradeId === "sellmulti").amount * 5);
  }

  if (upgrades.find((i) => i.upgradeId === "sell_multi")) {
    multi +=
      upgrades.find((i) => i.upgradeId === "sell_multi").amount *
      getUpgradesData()["sell_multi"].effect;
    breakdown.set(
      "upgrades",
      upgrades.find((i) => i.upgradeId === "sell_multi").amount *
        getUpgradesData()["sell_multi"].effect,
    );
  }

  if (
    (await getDmSettings(id)).voteReminder &&
    !(await redis.sismember(Constants.redis.nypsi.VOTE_REMINDER_RECEIVED, id))
  ) {
    multi += 5;
    breakdown.set("vote reminders", 5);
  }

  if (passive) {
    multi -= 5;
    breakdown.set("passive", -5);
  }

  const beforeBoosters = multi;

  for (const boosterId of boosters.keys()) {
    if (boosterId == "beginner_booster") {
      multi += 50;
    } else if (items[boosterId].boosterEffect.boosts.includes("sellmulti")) {
      multi += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  if (multi - beforeBoosters !== 0) breakdown.set("boosters", multi - beforeBoosters);
  const beforeGems = multi;

  let heart = false;

  if (inventory.find((i) => i.item === "crystal_heart")?.amount > 0) heart = true;
  if (inventory.find((i) => i.item == "white_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2 && !heart) {
      multi -= Math.floor(Math.random() * 6) + 1;
    } else {
      gemBreak(id, 0.01, "white_gem");
      const choices = [
        7, 3, 4, 5, 7, 2, 17, 7, 4, 5, 2, 2, 2, 2, 2, 3, 3, 3, 10, 17, 10, 7, 7, 7, 7,
      ];
      multi += Math.floor(Math.random() * choices[Math.floor(Math.random() * choices.length)]);
    }
  } else if (inventory.find((i) => i.item == "pink_gem")?.amount > 0) {
    const chance = Math.floor(Math.random() * 10);

    if (chance < 2 && !heart) {
      multi -= 3;
    } else {
      gemBreak(id, 0.07, "pink_gem");
      const choices = [7, 5, 4, 3, 2, 1, 3, 1, 1, 1, 3, 3, 7, 7, 7, 7, 7, 4, 4, 4, 4, 4, 4, 4];
      multi += choices[Math.floor(Math.random() * choices.length)];
    }
  }

  if (multi - beforeGems !== 0) breakdown.set("gems", multi - beforeGems);

  multi = Math.floor(multi);
  if (multi < 0) multi = 0;

  multi = multi / 100;

  return { multi: parseFloat(multi.toFixed(2)), breakdown };
}

export async function getMaxBankBalance(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const base = await prisma.economy
    .findUnique({
      where: {
        userId: id,
      },
      select: {
        bankStorage: true,
      },
    })
    .then((q) => Number(q.bankStorage));

  const level = await getRawLevel(id);
  const constant = 250;
  const starting = 20000;
  const bonus = level * constant;
  const max = bonus + starting;

  return max + base;
}

export async function bottomAmount(guild: Guild, amount: number): Promise<string[]> {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.economy.findMany({
    where: {
      AND: [{ money: { gt: 0 } }, { userId: { in: Array.from(members.keys()) } }],
    },
    select: {
      userId: true,
      money: true,
    },
    orderBy: {
      money: "asc",
    },
    take: amount,
  });

  const usersFinal = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of query) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    if (Number(user.money) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      usersFinal[count] =
        pos +
        " **" +
        getMemberID(guild, user.userId).user.username +
        "** $" +
        Number(user.money).toLocaleString();
      count++;
    }
  }

  return usersFinal;
}

export async function hasPadlock(member: GuildMember): Promise<boolean> {
  const cache = await redis.get(`${Constants.redis.cache.economy.PADLOCK}:${member.user.id}`);

  if (cache) {
    return cache === "y";
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: member.user.id,
    },
    select: {
      padlock: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.economy.PADLOCK}:${member.user.id}`,
    query.padlock ? "y" : "n",
  );
  await redis.expire(
    `${Constants.redis.cache.economy.PADLOCK}:${member.user.id}`,
    Math.floor(ms("6 hours") / 1000),
  );

  return query.padlock;
}

export async function setPadlock(member: GuildMember, setting: boolean) {
  await prisma.economy.update({
    where: {
      userId: member.user.id,
    },
    data: {
      padlock: setting,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.PADLOCK}:${member.user.id}`);
}

export async function getDefaultBet(member: GuildMember): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.DEFAULT_BET}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.DEFAULT_BET}:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      defaultBet: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.DEFAULT_BET}:${id}`, query.defaultBet);
  await redis.expire(`${Constants.redis.cache.economy.DEFAULT_BET}:${id}`, 3600);

  return query.defaultBet;
}

export async function setDefaultBet(member: GuildMember, setting: number) {
  await prisma.economy.update({
    where: {
      userId: member.user.id,
    },
    data: {
      defaultBet: setting,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.DEFAULT_BET}:${member.user.id}`);
}

export async function calcMaxBet(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists("nypsi:infinitemaxbet")) return 1000000000000;

  let total = 100000;

  const [voted, level, boosters, guildUpgrades, booster] = await Promise.all([
    hasVoted(member),
    getRawLevel(member),
    getBoosters(member),
    getGuildUpgradesByUser(member),
    isBooster(id),
  ]);

  const levelBonus = Math.floor(level / 10) * 50_000;

  total += levelBonus;

  if (total > 5_000_000) {
    total = 5_000_000;

    if (level > 500) total += Math.floor((level - 400) / 30) * 10000;
  }

  if (voted) {
    total += 50000;
  }

  if (booster) total += 250_000;
  if (guildUpgrades.find((i) => i.upgradeId === "maxbet"))
    total += guildUpgrades.find((i) => i.upgradeId === "maxbet").amount * 100_000;

  for (const boosterId of boosters.keys()) {
    if (getItems()[boosterId].boosterEffect.boosts.includes("maxbet")) {
      for (let i = 0; i < boosters.get(boosterId).length; i++) {
        total += total * getItems()[boosterId].boosterEffect.effect;
      }
    }
  }

  return total;
}

export async function getRequiredBetForXp(member: GuildMember | string): Promise<number> {
  let requiredBet = 1000;

  const level = await getRawLevel(member);

  requiredBet += Math.floor(level / 30) * 2500;

  if (requiredBet > 50_000) requiredBet = 50_000;

  return requiredBet;
}

export async function calcNetWorth(
  source: string,
  member: GuildMember | string,
  breakdown = false,
) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (!breakdown && (await redis.exists(`${Constants.redis.cache.economy.NETWORTH}:${id}`))) {
    return { amount: parseInt(await redis.get(`${Constants.redis.cache.economy.NETWORTH}:${id}`)) };
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      money: true,
      bank: true,
      Inventory: true,
      netWorth: true,
      Auction: {
        select: {
          itemId: true,
          itemAmount: true,
        },
        where: {
          sold: false,
        },
      },
      OffersGiven: {
        select: {
          money: true,
        },
        where: {
          sold: false,
        },
      },
      BakeryUpgrade: {
        select: {
          upgradeId: true,
          amount: true,
        },
      },
      EconomyWorker: {
        include: {
          upgrades: true,
        },
      },
      EconomyGuildMember: {
        select: {
          guild: {
            select: {
              balance: true,
              level: true,
              members: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      },
      CustomCar: {
        select: {
          upgrades: {
            select: {
              amount: true,
              type: true,
            },
          },
        },
      },
    },
  });

  let worth = 0;
  const breakdownItems = new Map<string, number>();

  if (!query) {
    await redis.set(`${Constants.redis.cache.economy.NETWORTH}:${id}`, worth);
    await redis.expire(`${Constants.redis.cache.economy.NETWORTH}:${id}`, ms("1 hour") / 1000);

    return { amount: worth };
  }

  worth += Number(query.money);
  worth += Number(query.bank);
  worth += Number(
    query.OffersGiven.length > 0
      ? query.OffersGiven.map((i) => i.money).reduce((a, b) => a + b)
      : 0,
  );

  for (const auction of query.Auction)
    worth += (await calcItemValue(auction.itemId)) * Number(auction.itemAmount);

  if (breakdown) breakdownItems.set("balance", worth);

  if (query.EconomyGuildMember?.guild) {
    const guildWorth =
      Number(query.EconomyGuildMember.guild.balance) /
      query.EconomyGuildMember.guild.members.length;

    worth += Math.floor(guildWorth);
    if (breakdown) breakdownItems.set("guild", Math.floor(guildWorth));
  } else if (breakdown) {
    breakdownItems.set("guild", 0);
  }

  for (const upgrade of query.BakeryUpgrade) {
    const item = getItems()[upgrade.upgradeId];

    let value = 0;

    const auctionAvg = await getAuctionAverage(item.id);
    const offersAvg = await getOffersAverage(item.id);

    if (auctionAvg && offersAvg) {
      value += Math.floor((await calcItemValue(item.id)) * upgrade.amount);
    } else if (auctionAvg) {
      value += upgrade.amount * auctionAvg;
    } else if (offersAvg) {
      value += upgrade.amount * offersAvg;
    } else {
      value = upgrade.amount * (item.sell || 1000);
    }

    worth += value;
    if (breakdown) {
      breakdownItems.has("bakery")
        ? breakdownItems.set("bakery", breakdownItems.get("bakery") + value)
        : breakdownItems.set("bakery", value);
    }
  }

  for (const item of query.Inventory) {
    if (
      item.item === "cookie" ||
      ["prey", "fish", "sellable", "ore"].includes(getItems()[item.item].role)
    ) {
      worth += getItems()[item.item].sell * Number(item.amount);
      if (breakdown)
        breakdownItems.set(item.item, getItems()[item.item].sell * Number(item.amount));
    } else if (getItems()[item.item].buy && getItems()[item.item].sell) {
      worth += getItems()[item.item].sell * Number(item.amount);
      if (breakdown)
        breakdownItems.set(item.item, getItems()[item.item].sell * Number(item.amount));
    } else {
      const [auctionAvg, offerAvg] = await Promise.all([
        getAuctionAverage(item.item),
        getOffersAverage(item.item),
      ]);

      if (auctionAvg && offerAvg) {
        const value = await calcItemValue(item.item);

        worth += Math.floor(value * Number(item.amount));
        if (breakdown) breakdownItems.set(item.item, value * Number(item.amount));
      } else if (offerAvg) {
        worth += offerAvg * Number(item.amount);
        if (breakdown) breakdownItems.set(item.item, offerAvg * Number(item.amount));
      } else if (auctionAvg) {
        worth += auctionAvg * Number(item.amount);
        if (breakdown) breakdownItems.set(item.item, auctionAvg * Number(item.amount));
      } else if (getItems()[item.item].sell) {
        worth += getItems()[item.item].sell * Number(item.amount);
        if (breakdown)
          breakdownItems.set(item.item, getItems()[item.item].sell * Number(item.amount));
      } else {
        worth += 1000 * Number(item.amount);
        if (breakdown) breakdownItems.set(item.item, 1000 * Number(item.amount));
      }
    }
  }

  let garageBreakdown = 0;

  for (let i = 0; i < query.CustomCar.length; i++) {
    garageBreakdown += calcCarCost(i);

    const car = query.CustomCar[i];

    for (const upgrade of car.upgrades) {
      garageBreakdown +=
        (await calcItemValue(
          Object.values(getItems()).find((i) => i.upgrades === upgrade.type).id,
        )) * upgrade.amount;
    }
  }

  breakdownItems.set("garage", garageBreakdown);
  worth += garageBreakdown;

  let workersBreakdown = 0;

  for (const worker of query.EconomyWorker) {
    const baseUpgrades = getBaseUpgrades();
    const baseWorkers = getBaseWorkers();

    for (const upgrade of worker.upgrades) {
      if (!baseUpgrades[upgrade.upgradeId].base_cost) {
        const itemId = Array.from(Object.keys(getItems())).find(
          (i) => getItems()[i].worker_upgrade_id === upgrade.upgradeId,
        );
        if (!itemId) continue;

        const [auctionAvg, offersAvg] = await Promise.all([
          getAuctionAverage(itemId),
          getOffersAverage(itemId),
        ]);

        if (auctionAvg && offersAvg) {
          worth += Math.floor((await calcItemValue(itemId)) * upgrade.amount);
          workersBreakdown += Math.floor((await calcItemValue(itemId)) * upgrade.amount);
        } else if (auctionAvg) {
          worth += upgrade.amount * auctionAvg;
          workersBreakdown += upgrade.amount * auctionAvg;
        } else if (offersAvg) {
          worth += upgrade.amount * offersAvg;
          workersBreakdown += upgrade.amount * offersAvg;
        } else {
          worth += 100_000;
        }
      } else {
        let totalCost = 0;

        let baseCost = _.clone(baseUpgrades[upgrade.upgradeId]).base_cost;

        baseCost =
          baseCost *
          (baseWorkers[worker.workerId].prestige_requirement >= 40
            ? baseWorkers[worker.workerId].prestige_requirement / 40
            : 1);

        for (let i = 0; i < upgrade.amount; i++) {
          const cost = baseCost + baseCost * i;

          totalCost += cost;
        }

        worth += totalCost;
        workersBreakdown += totalCost;
      }
    }

    const { perItem } = await calcWorkerValues(worker);

    worth += baseWorkers[worker.workerId].cost;
    worth += worker.stored * perItem;
    workersBreakdown += worker.stored * perItem;
    workersBreakdown += baseWorkers[worker.workerId].cost;
  }

  breakdownItems.set("workers", workersBreakdown);

  let farmBreakdown = 0;

  const farms = await getFarm(id);

  const typesChecked: string[] = [];

  for (const farm of farms) {
    if (typesChecked.includes(farm.plantId)) continue;

    const seed = Object.keys(getItems()).find((i) => getItems()[i].plantId === farm.plantId);

    const seedValue =
      farms.filter((i) => i.plantId === farm.plantId).length * (await calcItemValue(seed));
    const harvestValue =
      (await getClaimable(id, farm.plantId, false)) *
      (await calcItemValue(getPlantsData()[farm.plantId].item));
    
    let upgradesValue = 0;

    const upgrades = getPlantUpgrades();

    for (const userUpgrade of (await getFarmUpgrades(id)).filter(u => u.plantId == farm.plantId)) {
      const upgrade = upgrades[Object.keys(upgrades).find(u => upgrades[u].id == userUpgrade.upgradeId)];

      if (upgrade.type_single) {
        upgradesValue += userUpgrade.amount * (await calcItemValue(upgrade.type_single.item));
      } else if (upgrade.type_upgradable) {
        for (let i = 0; i < userUpgrade.amount; i++) {
          upgradesValue += await calcItemValue(upgrade.type_upgradable.items[i]);
        }
      }
    }

    worth += seedValue + harvestValue + upgradesValue;
    farmBreakdown += seedValue + harvestValue + upgradesValue;

    typesChecked.push(farm.plantId);
  }

  breakdownItems.set("farm", farmBreakdown);

  await redis.set(`${Constants.redis.cache.economy.NETWORTH}:${id}`, Math.floor(worth));
  await redis.expire(`${Constants.redis.cache.economy.NETWORTH}:${id}`, ms("2 hour") / 1000);

  await prisma.economy.update({
    where: {
      userId: id,
    },
    data: {
      netWorth: Math.floor(worth),
    },
    select: {
      userId: true,
    },
  });

  setImmediate(async () => {
    if (query.netWorth && (await getDmSettings(id)).netWorth > 0) {
      const payload: NotificationPayload = {
        memberId: id,
        payload: {
          content: "",
          embed: new CustomEmbed(
            null,
            `$${Number(query.netWorth).toLocaleString()} ➔ $${Math.floor(worth).toLocaleString()}`,
          ).setColor(Constants.TRANSPARENT_EMBED_COLOR),
        },
      };

      if (Number(query.netWorth) < Math.floor(worth) - (await getDmSettings(id)).netWorth) {
        payload.payload.content = `your net worth has increased by $${(
          Math.floor(worth) - Number(query.netWorth)
        ).toLocaleString()}`;
      } else if (Number(query.netWorth) > Math.floor(worth) + (await getDmSettings(id)).netWorth) {
        payload.payload.content = `your net worth has decreased by $${(
          Number(query.netWorth) - Math.floor(worth)
        ).toLocaleString()}`;
      } else {
        return;
      }

      logger.debug(`added net worth notification`, {
        userId: id,
        source,
      });

      addNotificationToQueue(payload);
    }
  });

  return { amount: Math.floor(worth), breakdown: breakdownItems };
}
