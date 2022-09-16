import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { NypsiClient } from "../../models/Client";
import { getTier, isPremium } from "../premium/premium";
import { getBoosters } from "./boosters";
import { getGuildByUser } from "./guilds";
import { getPrestige } from "./prestige";
import { getItems } from "./utils";
import { hasVoted } from "./vote";
import { getXp } from "./xp";

export async function getBalance(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:economy:balance:${id}`)) {
    return parseInt(await redis.get(`cache:economy:balance:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      money: true,
    },
  });

  await redis.set(`cache:economy:balance:${id}`, Number(query.money));
  await redis.expire(`cache:economy:balance:${id}`, 30);

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
  await redis.del(`cache:economy:balance:${id}`);
}

export async function getBankBalance(member: GuildMember): Promise<number> {
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

  if (await redis.exists(`cache:economy:defaultbet:${id}`)) {
    return parseInt(await redis.get(`cache:economy:defaultbet:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      defaultBet: true,
    },
  });

  await redis.set(`cache:economy:defaultbet:${id}`, query.defaultBet);
  await redis.expire(`cache:economy:defaultbet:${id}`, 3600);

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

  await redis.del(`cache:economy:defaultbet:${member.user.id}`);
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

  return total + bonus * (prestige > 15 ? 15 : prestige);
}

export async function getRequiredBetForXp(member: GuildMember): Promise<number> {
  let requiredBet = 1000;

  const prestige = await getPrestige(member);

  if (prestige > 2) requiredBet = 10000;

  requiredBet += prestige * 1000;

  return requiredBet;
}
