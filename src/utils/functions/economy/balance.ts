import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { getTier, isPremium } from "../premium/premium";
import workerSort from "../workers/sort";
import { getAuctionAverage } from "./auctions";
import { getBoosters } from "./boosters";
import { getGuildByUser } from "./guilds";
import { getPrestige } from "./prestige";
import { getBaseUpgrades, getBaseWorkers, getItems } from "./utils";
import { hasVoted } from "./vote";
import { calcWorkerValues } from "./workers";
import { getXp } from "./xp";
import ms = require("ms");
import _ = require("lodash");

export async function getBalance(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.BALANCE}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.BALANCE}:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      money: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.BALANCE}:${id}`, Number(query.money));
  await redis.expire(`${Constants.redis.cache.economy.BALANCE}:${id}`, 30);

  return Number(query.money);
}

export async function updateBalance(member: GuildMember | string, amount: number) {
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
      money: Math.floor(amount),
    },
  });
  await redis.del(`${Constants.redis.cache.economy.BALANCE}:${id}`);
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

export async function updateBankBalance(member: GuildMember, amount: number) {
  await prisma.economy.update({
    where: {
      userId: member.user.id,
    },
    data: {
      bank: amount,
    },
  });
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

export async function getMulti(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let multi = 0;

  const prestige = await getPrestige(member);

  const prestigeBonus = (prestige > 10 ? 10 : prestige) * 2;

  multi += prestigeBonus;

  if (await isPremium(id)) {
    switch (await getTier(id)) {
      case 2:
        multi += 4;
        break;
      case 3:
        multi += 6;
        break;
      case 4:
        multi += 10;
    }
  }

  const guild = await getGuildByUser(id);

  if (guild) {
    multi += guild.level - 1;
  }

  const boosters = await getBoosters(id);
  const items = getItems();

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].boosterEffect.boosts.includes("multi")) {
      multi += items[boosterId].boosterEffect.effect * boosters.get(boosterId).length;
    }
  }

  multi = Math.floor(multi);

  multi = multi / 100;

  return parseFloat(multi.toFixed(2));
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

  const xp = await getXp(id);
  const constant = 550;
  const starting = 15000;
  const bonus = xp * constant;
  const max = bonus + starting;

  return max + base;
}

export async function topAmountGlobal(amount: number, client?: NypsiClient, anon = true): Promise<string[]> {
  const query = await prisma.economy.findMany({
    where: {
      money: { gt: 1000 },
    },
    select: {
      userId: true,
      money: true,
      user: {
        select: {
          lastKnownTag: true,
        },
      },
    },
    orderBy: {
      money: "desc",
    },
  });

  const userIDs: string[] = [];
  const balances = new Map<string, number>();

  for (const user of query) {
    userIDs.push(user.userId);
    balances.set(user.userId, Number(user.money));
  }

  inPlaceSort(userIDs).desc((i) => balances.get(i));

  const usersFinal = [];

  let count = 0;

  for (const user of userIDs) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    if (balances.get(user) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      let username: string;

      if (client) {
        const res = await client.cluster.broadcastEval(
          async (c, { userId }) => {
            const user = await c.users.fetch(userId);

            if (user) {
              return user.tag;
            }
          },
          { context: { userId: user } }
        );

        for (const i of res) {
          if (i.includes("#")) {
            username = i;
            break;
          }
        }
      }

      if (anon) {
        username = username.split("#")[0];
      }

      usersFinal[count] = pos + " **" + username + "** $" + balances.get(user).toLocaleString();
      count++;
    }
  }
  return usersFinal;
}

export async function topAmount(guild: Guild, amount: number): Promise<string[]> {
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
      money: "desc",
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
        pos + " **" + getMemberID(guild, user.userId).user.tag + "** $" + Number(user.money).toLocaleString();
      count++;
    }
  }
  return usersFinal;
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
        pos + " **" + getMemberID(guild, user.userId).user.tag + "** $" + Number(user.money).toLocaleString();
      count++;
    }
  }

  return usersFinal;
}

export async function hasPadlock(member: GuildMember): Promise<boolean> {
  const query = await prisma.economy.findUnique({
    where: {
      userId: member.user.id,
    },
    select: {
      padlock: true,
    },
  });

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

export async function calcMaxBet(member: GuildMember): Promise<number> {
  const base = 100000;
  const voted = await hasVoted(member);
  const bonus = 50000;

  let total = base;

  if (voted) {
    total += 50000;
  }

  const prestige = await getPrestige(member);

  let calculated = total + bonus * prestige;

  if (calculated > 1_000_000) calculated = 1_000_000;

  const boosters = await getBoosters(member);

  for (const boosterId of boosters.keys()) {
    if (getItems()[boosterId].boosterEffect.boosts.includes("maxbet")) {
      for (let i = 0; i < boosters.get(boosterId).length; i++) {
        calculated += calculated * getItems()[boosterId].boosterEffect.effect;
      }
    }
  }

  return calculated;
}

export async function getRequiredBetForXp(member: GuildMember): Promise<number> {
  let requiredBet = 1000;

  const prestige = await getPrestige(member);

  if (prestige > 2) requiredBet = 10000;

  requiredBet += prestige * 1000;

  return requiredBet;
}

export async function calcNetWorth(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.NETWORTH}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.NETWORTH}:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      money: true,
      bank: true,
      Inventory: true,
      EconomyWorker: {
        include: {
          upgrades: true,
        },
      },
      user: {
        select: {
          EconomyGuild: {
            select: {
              balance: true,
              members: true,
            },
          },
        },
      },
    },
  });

  let worth = 0;

  if (!query) {
    await redis.set(`${Constants.redis.cache.economy.NETWORTH}:${id}`, worth);
    await redis.expire(`${Constants.redis.cache.economy.NETWORTH}:${id}`, ms("30 minutes") / 1000);

    return worth;
  }

  worth += Number(query.money);
  worth += Number(query.bank);
  worth += Number(query.user.EconomyGuild?.balance / query.user.EconomyGuild?.members.length) || 0;

  for (const item of query.Inventory) {
    const auctionAvg = await getAuctionAverage(item.item);

    if (auctionAvg) {
      worth += auctionAvg * item.amount;
    } else if (getItems()[item.item].sell) {
      worth += getItems()[item.item].sell * item.amount;
    }
  }

  for (const worker of query.EconomyWorker) {
    const baseUpgrades = getBaseUpgrades();
    const baseWorkers = getBaseWorkers();

    for (const upgrade of worker.upgrades) {
      if (!baseUpgrades[upgrade.upgradeId].base_cost) continue;

      let baseCost = _.clone(baseUpgrades[upgrade.upgradeId]).base_cost;

      baseCost =
        baseCost *
        (baseWorkers[upgrade.workerId].prestige_requirement >= 4
          ? baseWorkers[upgrade.workerId].prestige_requirement / 2
          : baseWorkers[upgrade.workerId].prestige_requirement - 0.5);

      // zack's formula ((price+amount×price)×amount)/2

      const cost = ((baseCost + upgrade.amount * baseCost) * upgrade.amount) / 2;

      worth += cost;
    }

    const { perItem } = await calcWorkerValues(worker);

    worth += worker.stored * perItem;
  }

  await redis.set(`${Constants.redis.cache.economy.NETWORTH}:${id}`, Math.floor(worth));
  await redis.expire(`${Constants.redis.cache.economy.NETWORTH}:${id}`, ms("30 minutes") / 1000);

  return Math.floor(worth);
}

export async function topNetWorth(guild: Guild, amount: number): Promise<string[]> {
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
      AND: [{ userId: { in: Array.from(members.keys()) } }, { money: { gt: 0 } }],
    },
    select: {
      userId: true,
    },
  });

  const amounts = new Map<string, number>();
  let userIds: string[] = [];

  for (const user of query) {
    amounts.set(user.userId, await calcNetWorth(user.userId));

    userIds.push(user.userId);
  }

  if (userIds.length > 500) {
    userIds = await workerSort(userIds, amounts);
    userIds.reverse();
  } else {
    inPlaceSort(userIds).desc((i) => amounts.get(i));
  }

  const usersFinal = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of userIds) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    if (amounts.get(user) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      usersFinal[count] = pos + " **" + getMemberID(guild, user).user.tag + "** $" + amounts.get(user).toLocaleString();
      count++;
    }
  }
  return usersFinal;
}
