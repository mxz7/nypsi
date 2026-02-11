import { exec } from "child_process";
import { GuildMember, User } from "discord.js";
import { inPlaceSort } from "fast-sort";
import * as fs from "fs";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import {
  AchievementData,
  BakeryUpgradeData,
  BanCache,
  DabloonShopItem,
  Event,
  GuildUpgrade,
  Item,
  Plant,
  PlantUpgrade,
  UserUpgrade,
} from "../../../types/Economy";
import { LootPool } from "../../../types/LootPool";
import { Tag } from "../../../types/Tags";
import { Task } from "../../../types/Tasks";
import { Worker, WorkerUpgrades } from "../../../types/Workers";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { deleteImage } from "../image";
import { getUserId, MemberResolvable } from "../member";
import { getAllGroupAccountIds } from "../moderation/alts";
import { pluralize } from "../string";
import { isUserBlacklisted } from "../users/blacklist";
import { isMarried } from "../users/marriage";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getLastKnownAvatar, getLastKnownUsername } from "../users/username";
import { createProfile, hasProfile } from "../users/utils";
import { setProgress } from "./achievements";
import { addBalance, calcMaxBet, getBalance } from "./balance";
import { formatEventProgress, getCurrentEvent } from "./events";
import { addToGuildXP, getGuildByUser, getGuildName } from "./guilds";
import { addInventoryItem } from "./inventory";
import { getDefaultLootPool } from "./loot_pools";
import { addStat } from "./stats";
import { addTaskProgress } from "./tasks";
import { addXp } from "./xp";
import ms = require("ms");
import math = require("mathjs");
import pAll = require("p-all");
import dayjs = require("dayjs");

let items: { [key: string]: Item };
let achievements: { [key: string]: AchievementData };
let baseWorkers: { [key: string]: Worker };
let baseUpgrades: { [key: string]: WorkerUpgrades };
let bakeryUpgrades: { [key: string]: BakeryUpgradeData };
let guildUpgrades: { [key: string]: GuildUpgrade };
let userUpgrades: { [key: string]: UserUpgrade };
let tags: { [key: string]: Tag };
let tasks: { [key: string]: Task };
let plants: { [key: string]: Plant };
let plantUpgrades: { [key: string]: PlantUpgrade };
let lootPools: { [key: string]: LootPool };
let events: { [key: string]: Event };
let dabloonShop: Record<string, DabloonShopItem>;

export let maxPrestige = 0;

export function loadItems(crypto = true) {
  maxPrestige = 0;
  const itemsFile: any = fs.readFileSync("./data/items.json");
  const achievementsFile: any = fs.readFileSync("./data/achievements.json");
  const workersFile: any = fs.readFileSync("./data/workers.json");
  const bakeryFile: any = fs.readFileSync("./data/bakery_upgrades.json");
  const guildUpgradesFile: any = fs.readFileSync("./data/guild_upgrades.json");
  const tagsFile: any = fs.readFileSync("./data/tags.json");
  const userUpgradesFile: any = fs.readFileSync("./data/upgrades.json");
  const tasksFile: any = fs.readFileSync("./data/tasks.json");
  const plantsFile: any = fs.readFileSync("./data/plants.json");
  const lootPoolsFile: any = fs.readFileSync("./data/loot_pools.json");
  const eventsFile: any = fs.readFileSync("./data/events.json");
  const dabloonShopFile: any = fs.readFileSync("./data/dabloon_shop.json");

  items = JSON.parse(itemsFile);
  achievements = JSON.parse(achievementsFile);
  baseWorkers = JSON.parse(workersFile).workers;
  baseUpgrades = JSON.parse(workersFile).upgrades;
  bakeryUpgrades = JSON.parse(bakeryFile);
  guildUpgrades = JSON.parse(guildUpgradesFile);
  tags = JSON.parse(tagsFile);
  userUpgrades = JSON.parse(userUpgradesFile);
  tasks = JSON.parse(tasksFile);
  plants = JSON.parse(plantsFile).plants;
  plantUpgrades = JSON.parse(plantsFile).upgrades;
  lootPools = JSON.parse(lootPoolsFile);
  events = JSON.parse(eventsFile);
  dabloonShop = JSON.parse(dabloonShopFile);

  lootPools.basic_crate = getDefaultLootPool((i) => i.in_crates);
  lootPools.basic_crate.money = { 50000: 100, 100000: 100, 500000: 100 };
  lootPools.basic_crate.xp = { 50: 100, 100: 100, 250: 100 };
  lootPools.workers_crate = getDefaultLootPool((i) => i.role === "worker-upgrade");
  lootPools.boosters_crate = getDefaultLootPool((i) => i.role === "booster");
  lootPools.pandora_box = getDefaultLootPool(
    (i) => !["sellable", "ore", "fuel"].includes(i.role) && !i.unique && i.id !== "hanafuda_tag",
  );

  for (const item in lootPools.pandora_box.items) {
    if (getItems()[item].role === "tag") {
      lootPools.pandora_box.items[item] = 1;
    } else {
      lootPools.pandora_box.items[item] = 100;
    }
  }

  delete lootPools.pandora_box.items["karma_tag"];

  Object.values(userUpgrades).forEach((i) => {
    maxPrestige += i.max;
  });

  const workerIds = Object.keys(baseWorkers);

  inPlaceSort(workerIds).asc((w) => baseWorkers[w].prestige_requirement);

  const newObj: { [key: string]: Worker } = {};

  for (const workerId of workerIds) {
    newObj[workerId] = baseWorkers[workerId];
  }

  baseWorkers = newObj;

  logger.info(`${Object.keys(baseWorkers).length} workers loaded`);
  logger.info(`${Object.keys(baseUpgrades).length} worker upgrades loaded`);

  logger.info(`${Array.from(Object.keys(items)).length.toLocaleString()} economy items loaded`);
  logger.info(`${Object.keys(achievements).length.toLocaleString()} achievements loaded`);
  logger.info(`${Object.keys(tags).length} tags loaded`);
  logger.info(`${Object.keys(userUpgrades).length} user upgrades loaded`);
  logger.info(`${Object.keys(tasks).length} tasks loaded`);
  logger.info(`${Object.keys(plants).length} plants loaded`);
  logger.info(`${Object.keys(lootPools).length} loot pools loaded`);
  logger.info(`max prestige set at P${maxPrestige}`);

  if (new Date().getMonth() === 9) {
    items["pumpkin"].unique = false;
    logger.info("pumpkins enabled");
  }

  if (new Date().getMonth() === 11) {
    items["christmas_tree"].unique = false;
    logger.info("christmas trees enabled");
  }

  if (crypto) {
    setTimeout(() => {
      updateCryptoWorth();
    }, 50);
  }
}

async function updateCryptoWorth() {
  let res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=BTC").then((res) =>
    res.json(),
  );

  const btcworth = Math.floor(res.data.rates.USD);

  if (btcworth > 1_000_000) {
    logger.error("FATAL - something wrong with btc");
    return;
  }

  items["bitcoin"].buy = btcworth;
  items["bitcoin"].sell = Math.floor(btcworth * 0.95);
  logger.info("bitcoin worth updated: $" + items["bitcoin"].buy.toLocaleString());

  res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=ETH").then((res) =>
    res.json(),
  );

  const ethWorth = Math.floor(res.data.rates.USD);

  if (!ethWorth) {
    logger.error("INVALID ETH WORTH");
    return logger.error("eth error", res);
  }

  if (ethWorth > 1_000_000) {
    logger.error("FATAL - something wrong with eth");
    return;
  }

  items["ethereum"].buy = ethWorth;
  items["ethereum"].sell = Math.floor(ethWorth * 0.95);
  logger.info("ethereum worth updated: $" + items["ethereum"].buy.toLocaleString());
}

export function getBaseWorkers() {
  return baseWorkers;
}

export function getBaseUpgrades() {
  return baseUpgrades;
}

export function getGuildUpgradeData() {
  return guildUpgrades;
}

export function runEconomySetup() {
  setInterval(updateCryptoWorth, 1500000);

  loadItems();
}

export async function userExists(member: MemberResolvable): Promise<boolean> {
  const userId = getUserId(member);

  if (!userId) return;

  const cache = await redis.get(`${Constants.redis.cache.economy.EXISTS}:${userId}`);

  if (cache) {
    return cache === "true";
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      userId: true,
    },
  });

  if (query) {
    await redis.set(
      `${Constants.redis.cache.economy.EXISTS}:${userId}`,
      "true",
      "EX",
      ms("7 day") / 1000,
    );
    return true;
  } else {
    await redis.set(
      `${Constants.redis.cache.economy.EXISTS}:${userId}`,
      "false",
      "EX",
      ms("7 day") / 1000,
    );
    return false;
  }
}

export async function createUser(member: MemberResolvable) {
  const userId = getUserId(member);

  if (!userId) return;

  if (await redis.exists(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${userId}`)) return;

  if (!(await hasProfile(userId))) {
    if (member instanceof GuildMember) {
      await createProfile(member.user);
    } else {
      await createProfile(userId);
    }
  }

  await prisma.economy.create({
    data: {
      userId,
      lastVote: new Date(0),
      lastDaily: new Date(0),
    },
  });
  await redis.del(`${Constants.redis.cache.economy.EXISTS}:${userId}`);
  await addInventoryItem(userId, "beginner_booster", 1);
}

export async function formatBet(
  bet: string | number,
  member: MemberResolvable,
  maxBet?: number,
): Promise<number | null> {
  if (!maxBet) maxBet = await calcMaxBet(member);

  bet = bet.toString().toLowerCase().replaceAll("Μ", "m");

  if (bet == "all") {
    bet = await getBalance(member);
    if (bet > maxBet) {
      bet = maxBet;
    }
  } else if (bet == "max") {
    bet = maxBet;
  } else if (bet == "half") {
    bet = Math.floor((await getBalance(member)) / 2);
  }

  const formatted = formatNumber(bet.toString());

  if (formatted) {
    bet = formatted;
  } else {
    return null;
  }

  if (bet <= 0) return null;

  return bet;
}

export function formatNumber(number: string | number) {
  number = number.toString().toLowerCase().replaceAll(",", "");
  if (number.includes("b")) {
    number = parseFloat(number.toString()) * 1000000000;
  } else if (number.includes("m")) {
    number = parseFloat(number.toString()) * 1000000;
  } else if (number.includes("k")) {
    number = parseFloat(number.toString()) * 1000;
  }

  if (isNaN(parseFloat(number.toString()))) return null;

  return Math.floor(parseFloat(number.toString()));
}

export function formatNumberPretty(number: number): string {
  let out: string;
  if (number >= 1e12) {
    out = (number / 1e12).toFixed(1) + "t";
  } else if (number >= 1e9) {
    out = (number / 1e9).toFixed(1) + "b";
  } else if (number >= 1e6) {
    out = (number / 1e6).toFixed(1) + "m";
  } else if (number >= 1e3) {
    out = (number / 1e3).toFixed(1) + "k";
  } else {
    return number.toString();
  }

  return out.replace(".0", "");
}

export async function isEcoBanned(member: MemberResolvable): Promise<BanCache> {
  const userId = getUserId(member);

  const blacklist = await isUserBlacklisted(userId);
  if (blacklist.blacklisted)
    return { banned: true, bannedAccount: blacklist.relation, expire: 0 } as BanCache;

  const cache = await redis.get(`${Constants.redis.cache.economy.BANNED}:${userId}`);

  if (cache) {
    const res = JSON.parse(cache) as BanCache;

    if (res.banned && res.expire < Date.now()) return { banned: false } as BanCache;

    return res;
  }

  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, userId);

  for (const accountId of accounts) {
    const cache = await redis.get(`${Constants.redis.cache.economy.BANNED}:${accountId}`);

    if (cache) {
      const res = JSON.parse(cache) as BanCache;

      if (res.banned) {
        if (res.expire < Date.now()) {
          await redis.del(`${Constants.redis.cache.economy.BANNED}:${accountId}`);
          return { banned: false };
        }
        return res;
      }
    } else {
      const query = await prisma.economy.findUnique({
        where: { userId: accountId },
        select: { banned: true },
      });

      if (query && query.banned) {
        if (query.banned.getTime() > Date.now()) {
          for (const accountId2 of accounts) {
            await redis.set(
              `${Constants.redis.cache.economy.BANNED}:${accountId2}`,
              JSON.stringify({
                banned: true,
                bannedAccount: accountId,
                expire: query.banned.getTime(),
              }),
              "EX",
              ms("3 hour") / 1000,
            );
          }

          return { banned: true, bannedAccount: accountId, expire: query.banned.getTime() };
        }
      }
    }
  }

  for (const id of accounts)
    await redis.set(
      `${Constants.redis.cache.economy.BANNED}:${id}`,
      JSON.stringify({ banned: false }),
      "EX",
      ms("3 hour") / 1000,
    );

  return { banned: false };
}

export async function getEcoBanTime(member: MemberResolvable) {
  const accounts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, getUserId(member));

  for (const accountId of accounts) {
    const query = await prisma.economy.findUnique({
      where: { userId: accountId },
      select: { banned: true },
    });

    if (query && query.banned && query.banned.getTime() > Date.now()) {
      return query.banned;
    }
  }
}

export async function setEcoBan(member: MemberResolvable, date?: Date) {
  const userId = getUserId(member);

  if (!date) {
    await prisma.economy.update({
      where: {
        userId,
      },
      data: {
        banned: new Date(0),
      },
    });
  } else {
    await prisma.economy.update({
      where: {
        userId,
      },
      data: {
        banned: date,
      },
    });
  }

  exec(`redis-cli KEYS "*economy:banned*" | xargs redis-cli DEL`);
}

export async function reset() {
  logger.info("deleting boosters");
  await prisma.booster.deleteMany();
  await prisma.$executeRaw`TRUNCATE TABLE "Booster" RESTART IDENTITY;`;
  logger.info("deleting games");
  await prisma.game.deleteMany();
  await prisma.$executeRaw`TRUNCATE TABLE "Game" RESTART IDENTITY;`;
  logger.info("deleting stats");
  await prisma.stats.deleteMany();
  logger.info("deleting guilds");
  await prisma.economyGuildMember.deleteMany();
  const guilds = await prisma.economyGuild.findMany({ select: { avatarId: true } });
  for (const guild of guilds) {
    if (guild.avatarId) await deleteImage(guild.avatarId);
  }
  await prisma.economyGuild.deleteMany();
  logger.info("deleting market orders");
  await prisma.market.deleteMany({ where: { completed: false } });
  logger.info("deleting offers");
  await prisma.offer.deleteMany({ where: { sold: false } });
  logger.info("deleting trades");
  await prisma.tradeRequest.deleteMany({ where: { completed: false } });
  logger.info("deleting workers");
  await prisma.economyWorkerUpgrades.deleteMany();
  await prisma.economyWorker.deleteMany();
  logger.info("deleting inventory");
  await prisma.inventory.deleteMany({ where: { item: { notIn: ["gold_star", "dabloon"] } } });
  logger.info("deleting crafting");
  await prisma.crafting.deleteMany();
  await prisma.$executeRaw`TRUNCATE TABLE "Crafting" RESTART IDENTITY;`;
  logger.info("deleting bakery");
  await prisma.bakeryUpgrade.deleteMany();
  logger.info("deleting graph");
  await prisma.graphMetrics.deleteMany({
    where: {
      OR: [{ category: "networth" }, { category: "balance" }, { category: { contains: "guild" } }],
    },
  });
  logger.info("deleting cars");
  await prisma.carUpgrade.deleteMany();
  await prisma.customCar.deleteMany();
  logger.info("deleting tasks");
  await prisma.task.deleteMany();
  logger.info("deleting farms");
  await prisma.farm.deleteMany();
  await prisma.farmUpgrades.deleteMany();
  await prisma.$executeRaw`TRUNCATE TABLE "Farm" RESTART IDENTITY;`;
  logger.info("deleting marriages");
  await prisma.marriage.deleteMany();
  logger.info("deleting premium with tier 0");
  await prisma.premium.deleteMany({
    where: {
      level: 0,
    },
  });
  logger.info("deleting banned/blacklisted");
  await prisma.economy.deleteMany({
    where: {
      OR: [{ banned: { gt: new Date() } }, { user: { blacklisted: true } }],
    },
  });

  logger.info("deleting inactive");
  const deleted = await prisma.economy
    .deleteMany({
      where: {
        AND: [{ prestige: 0 }, { dailyStreak: 0 }, { level: 0 }],
      },
    })
    .then((r) => r.count);

  logger.info("resetting");
  const query = await prisma.economy.findMany({ include: { Upgrades: true } });
  let updated = 0;

  for (const user of query) {
    let newLevel = user.level - (user.level % 100);
    if (user.prestige < 1 && user.level < 101) newLevel = user.level;

    await prisma.economy.update({
      where: {
        userId: user.userId,
      },
      data: {
        money: 500,
        bank: 9500,
        bankStorage: 5000,
        defaultBet: 0,
        xp: 0,
        padlock: false,
        level: newLevel,
        seasonVote: 0,
        netWorth: 0,
      },
    });

    const upgradesCount = user.Upgrades.map((i) => i.amount).reduce((a, b) => a + b, 0);

    if (upgradesCount !== user.prestige) {
      if (user.prestige === 0) {
        logger.info(`deleting upgrades for ${user.userId}`, { upgrades: user.Upgrades });
        await prisma.upgrades.deleteMany({ where: { userId: user.userId } });
      }
      logger.error(`invalid upgrade count for ${user.userId}`);
    }

    updated++;
  }

  exec(`redis-cli KEYS "*economy*" | xargs redis-cli DEL`);

  logger.info("done");

  return updated + deleted;
}

export function getItems(): { [key: string]: Item } {
  if (!items) {
    logger.warn("refetching items");
    const itemsFile: any = fs.readFileSync("./data/items.json");

    return JSON.parse(itemsFile);
  }

  return items;
}

export function getDabloonsShop() {
  return dabloonShop;
}

export function getTagsData() {
  return tags;
}

export function getUpgradesData() {
  return userUpgrades;
}

export function getBakeryUpgradesData() {
  return bakeryUpgrades;
}

export function getAchievements() {
  return achievements;
}

export function getTasksData() {
  return tasks;
}

export function getPlantsData() {
  return plants;
}

export function getPlantUpgrades() {
  return plantUpgrades;
}

export function getLootPools() {
  return lootPools;
}

export function getEventsData() {
  return events;
}

export async function deleteUser(member: MemberResolvable) {
  const userId = getUserId(member);

  exec(`redis-cli KEYS "*:${userId}:*" | xargs redis-cli DEL`);

  const guild = await getGuildByUser(member);

  if (guild) {
    if (guild.ownerId == userId) {
      await prisma.economyGuildMember.deleteMany({
        where: { guildName: guild.guildName },
      });

      await prisma.economyGuild.delete({
        where: {
          guildName: guild.guildName,
        },
      });
    } else {
      await prisma.economyGuildMember.delete({
        where: {
          userId,
        },
      });
    }
  }

  await prisma.booster.deleteMany({
    where: { userId },
  });
  await prisma.economy.delete({
    where: {
      userId,
    },
  });
}

export async function isHandcuffed(member: MemberResolvable): Promise<boolean> {
  return (await redis.exists(`economy:handcuffed:${getUserId(member)}`)) == 1;
}

export async function addHandcuffs(member: MemberResolvable) {
  await redis.set(`economy:handcuffed:${getUserId(member)}`, Date.now(), "EX", 60);
}

export async function getLastDaily(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      lastDaily: true,
    },
  });

  return query.lastDaily;
}

export async function updateLastDaily(member: MemberResolvable, updateLast = true, amount = 1) {
  await prisma.economy.update({
    where: {
      userId: getUserId(member),
    },
    data: updateLast
      ? {
          lastDaily: new Date(),
          dailyStreak: { increment: amount },
        }
      : {
          dailyStreak: { increment: amount },
        },
  });
}

export async function getDailyStreak(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      dailyStreak: true,
    },
  });

  return query.dailyStreak;
}

export async function doDaily(
  member: GuildMember | User,
  updateLast = true,
  amount = 1,
  rerun = false,
  streakToken = false,
) {
  const [currentStreak, marriage] = await Promise.all([getDailyStreak(member), isMarried(member)]);

  let totalMoney = 0;
  let totalXp = 0;
  let totalCards = amount;
  let marriageBonus = false;

  const totalRewards = new Map<string, number>();

  const addRewards = (i: number) => {
    const streak = currentStreak + i;

    const money = getDailyMoney(streak);
    const xp = getDailyXp(streak);

    totalMoney += money;
    totalXp += xp;

    if (streak % 7 == 0) {
      let crate = 1;

      crate += Math.floor(math.sqrt(streak / 1.3) as number);

      if (crate > 10) crate = 10;

      totalRewards.set("basic_crate", (totalRewards.get("basic_crate") ?? 0) + crate);
    }

    if (streak % 69 == 0) {
      totalRewards.set("69420_crate", (totalRewards.get("69420_crate") ?? 0) + 5);
    }

    if (streak % 100 == 0) {
      totalRewards.set("nypsi_crate", (totalRewards.get("nypsi_crate") ?? 0) + 1);
    }

    if (streak % 500 == 0) {
      totalRewards.set("gem_crate", (totalRewards.get("gem_crate") ?? 0) + 1);
    }
  };

  if (rerun) {
    addRewards(0);
  } else {
    for (let i = 1; i <= amount; i++) {
      addRewards(i);
    }
  }

  const promises: (() => Promise<any>)[] = [];

  if (marriage && !streakToken) {
    const lastDaily = await getLastDaily(marriage.partnerId);

    const today = dayjs().set("hour", 0).set("minute", 0).set("second", 0).set("millisecond", 0);

    if (lastDaily && dayjs(lastDaily).isAfter(today)) {
      marriageBonus = true;

      const [marriageStreak, marriageDmSettings] = await Promise.all([
        getDailyStreak(marriage.partnerId),
        getDmSettings(marriage.partnerId),
      ]);

      const marriageMoney = getDailyMoney(marriageStreak);
      const marriageXp = getDailyXp(marriageStreak);

      promises.push(() => addBalance(marriage.partnerId, marriageMoney));
      promises.push(() => addXp(marriage.partnerId, marriageXp));
      promises.push(() => addInventoryItem(marriage.partnerId, "daily_scratch_card", 1));

      if (marriageDmSettings.other) {
        const embed = new CustomEmbed(marriage.partnerId);

        embed.setHeader("daily", await getLastKnownAvatar(marriage.partnerId));
        embed.setDescription(
          `💍 **${await getLastKnownUsername(member.id)}** has done their daily streak!`,
        );
        embed.addField(
          "rewards",
          `+$**${marriageMoney.toLocaleString()}**` +
            `\n+ **1** ${items["daily_scratch_card"].emoji} ${pluralize(items["daily_scratch_card"], amount)}`,
        );

        addNotificationToQueue({
          memberId: marriage.partnerId,
          payload: { embed },
        });
      }

      // should only get 1 from /daily
      totalCards = 2;
      totalMoney *= 2;
      totalXp *= 2;
    }
  }

  const rewards: string[] = [
    `+$**${totalMoney.toLocaleString()}**`,
    `+ ${totalCards > 1 ? `**${amount.toLocaleString()}** ` : ""}${items["daily_scratch_card"].emoji} ${pluralize(items["daily_scratch_card"], amount)}`,
  ];

  for (const [itemId, amount] of totalRewards) {
    promises.push(async () => {
      await addInventoryItem(member, itemId, amount);
    });

    rewards.push(
      `+ **${amount.toLocaleString()}** ${items[itemId].emoji} ${pluralize(items[itemId], amount)}`,
    );
  }

  promises.push(async () => {
    await addBalance(member, totalMoney);
  });

  promises.push(async () => {
    await addInventoryItem(member, "daily_scratch_card", totalCards);
  });

  if (!rerun) {
    promises.push(async () => {
      await updateLastDaily(member, updateLast, amount);
    });
  }

  await pAll(promises, { concurrency: 3 });

  let desc = `daily streak: \`${currentStreak}\`${rerun ? "" : ` -> \`${currentStreak + amount}\``}`;

  if (marriageBonus && marriage) {
    desc += `\n💍 **${await getLastKnownUsername(marriage.partnerId)}** marriage bonus`;
  }

  const embed = new CustomEmbed(member);
  embed.setHeader("daily", member instanceof GuildMember ? member.user.avatarURL() : undefined);
  embed.setDescription(desc);

  embed.addField("rewards", rewards.join("\n"));

  if (totalXp > 0) {
    await addXp(member, totalXp);
    embed.setFooter({ text: `+${totalXp.toLocaleString()}xp` });

    const guild = await getGuildName(member);

    if (guild) {
      await addToGuildXP(guild, totalXp, member);
    }
  }

  addStat(member, "earned-daily", totalMoney);
  setProgress(member, "streaker", rerun ? currentStreak : currentStreak + amount);
  addTaskProgress(member, "daily_streaks", amount);

  return embed;
}

function getDailyMoney(currentStreak: number) {
  let money = Math.floor(math.square(currentStreak * 7) + 25_000);

  if (money > 1_000_000) money = 1_000_000;

  return money;
}

function getDailyXp(currentStreak: number) {
  let xp = 1;

  if (currentStreak > 5) {
    xp = Math.floor((currentStreak - 5) / 10);
  }

  if (xp > 69) xp = 69;

  return xp;
}

export async function setDaily(member: MemberResolvable, amount: number) {
  await prisma.economy.update({
    where: {
      userId: getUserId(member),
    },
    data: {
      dailyStreak: amount,
    },
  });
}

type BaseRenderGambleScreenArgs = {
  state: "playing" | "lose" | "draw";
  bet: number;
  insert?: string;
  userId: string;
};

type WinRenderGambleScreenArgs = {
  state: "win";
  bet: number;
  insert?: string;
  userId: string;
  winnings: number;
  multiplier?: number;
  eventProgress?: number;
};

// Overloads
export function renderGambleScreen(args: BaseRenderGambleScreenArgs): Promise<string>;
export function renderGambleScreen(args: WinRenderGambleScreenArgs): Promise<string>;

// Implementation
export async function renderGambleScreen(
  args: BaseRenderGambleScreenArgs | WinRenderGambleScreenArgs,
): Promise<string> {
  let output = `**bet** $${args.bet.toLocaleString()}${args.insert ? `\n${args.insert}` : ""}`;

  if (args.state === "playing") {
    return output;
  }

  if (args.state === "lose") {
    output += "\n\n**you lose!!**";
  }

  if (args.state === "draw") {
    output += `\n\n**draw!!**\n**you win** $${args.bet.toLocaleString()}`;
  }

  if (args.state === "win") {
    output += `\n\n**winner!!!**\n**you win** $${args.winnings.toLocaleString()}${
      args.multiplier ? `\n+**${Math.floor(args.multiplier * 100).toString()}%** bonus` : ""
    }`;

    if (args.eventProgress) {
      const event = await getCurrentEvent();

      output += `\n\n${formatEventProgress(event, args.eventProgress, args.userId)}`;
    }
  }

  return output;
}
