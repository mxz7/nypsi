import { Collection, Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import ms = require("ms");
import Constants from "../../Constants";

export async function topAmountPrestige(guild: Guild, amount: number): Promise<string[]> {
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
      AND: [{ prestige: { gt: 0 } }, { userId: { in: Array.from(members.keys()) } }],
    },
    select: {
      userId: true,
      prestige: true,
    },
    orderBy: {
      prestige: "desc",
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

    if (user.prestige != 0) {
      let pos: string | number = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      const thing = ["th", "st", "nd", "rd"];
      const v = user.prestige % 100;
      usersFinal[count] =
        pos +
        " **" +
        getMemberID(guild, user.userId).user.tag +
        "** " +
        user.prestige +
        (thing[(v - 20) % 10] || thing[v] || thing[0]) +
        " prestige";
      count++;
    }
  }
  return usersFinal;
}

export async function getPrestige(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.PRESTIGE}:${id}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.PRESTIGE}:${id}`));
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      prestige: true,
    },
  });

  await redis.set(`${Constants.redis.cache.economy.PRESTIGE}:${id}`, query.prestige);
  await redis.expire(`${Constants.redis.cache.economy.PRESTIGE}:${id}`, ms("1 hour") / 1000);

  return query.prestige;
}

export async function setPrestige(member: GuildMember, amount: number) {
  await prisma.economy.update({
    where: {
      userId: member.user.id,
    },
    data: {
      prestige: amount,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.PRESTIGE}:${member.user.id}`);
}

export async function getPrestigeRequirement(member: GuildMember): Promise<number> {
  const constant = 500;
  const extra = (await getPrestige(member)) * constant;

  return 500 + extra;
}

export function getPrestigeRequirementBal(xp: number): number {
  const constant = 500;
  const bonus = xp * constant;

  return bonus;
}
