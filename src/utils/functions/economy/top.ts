import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import workerSort from "../workers/sort";
import { calcNetWorth } from "./balance";
import { getAchievements, getItems } from "./utils";

export async function topBalance(guild: Guild, amount: number): Promise<string[]> {
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

export async function topBalanceGlobal(amount: number, anon = true): Promise<string[]> {
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
    take: amount,
  });

  const usersFinal = [];

  let count = 0;

  for (const user of query) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    let pos: number | string = count + 1;

    if (pos == 1) {
      pos = "🥇";
    } else if (pos == 2) {
      pos = "🥈";
    } else if (pos == 3) {
      pos = "🥉";
    }

    let username = user.user.lastKnownTag;

    if (anon) {
      username = username.split("#")[0];
    }

    usersFinal[count] = pos + " **" + username + "** $" + Number(user.money).toLocaleString();
    count++;
  }
  return usersFinal;
}

export async function topNetWorthGlobal(amount: number, userId: string) {
  const query = await prisma.economy.findMany({
    where: {
      net_worth: { gt: 0 },
    },
    select: {
      userId: true,
      net_worth: true,
      user: {
        select: {
          lastKnownTag: true,
        },
      },
    },
    orderBy: {
      net_worth: "desc",
    },
  });

  const out: string[] = [];

  for (const user of query) {
    if (out.length >= amount) break;
    if (out.join("\n").length > 1500) break;

    let pos: number | string = out.length + 1;

    if (pos == 1) {
      pos = "🥇";
    } else if (pos == 2) {
      pos = "🥈";
    } else if (pos == 3) {
      pos = "🥉";
    }

    out[out.length + 1] =
      pos + " **" + user.user.lastKnownTag.split("#")[0] + "** $" + Number(user.net_worth).toLocaleString();
  }

  return { list: out, userPos: query.map((i) => i.userId).indexOf(userId) + 1 };
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

  const promises = [];

  for (const user of query) {
    promises.push(
      (async () => {
        const net = await calcNetWorth(user.userId);

        amounts.set(user.userId, net);
        userIds.push(user.userId);
        return;
      })()
    );
  }

  await Promise.all(promises);

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

export async function topPrestige(guild: Guild, amount: number): Promise<string[]> {
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

export async function topItem(guild: Guild, amount: number, item: string): Promise<string[]> {
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

  const query = await prisma.inventory.findMany({
    where: {
      AND: [{ userId: { in: Array.from(members.keys()) } }, { item: item }],
    },
    select: {
      userId: true,
      amount: true,
    },
    orderBy: {
      amount: "desc",
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

    let pos: number | string = count + 1;

    if (pos == 1) {
      pos = "🥇";
    } else if (pos == 2) {
      pos = "🥈";
    } else if (pos == 3) {
      pos = "🥉";
    }

    const items = getItems();

    usersFinal[count] =
      pos +
      " **" +
      getMemberID(guild, user.userId).user.tag +
      "** " +
      user.amount.toLocaleString() +
      ` ${user.amount > 1 ? items[item].plural || items[item].name : items[item].name}`;
    count++;
  }
  return usersFinal;
}

export async function topCompletion(guild: Guild, amount = 10): Promise<string[]> {
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

  const query = await prisma.achievements.findMany({
    where: {
      AND: [{ completed: true }, { userId: { in: Array.from(members.keys()) } }],
    },
    select: {
      userId: true,
    },
  });

  if (query.length == 0) {
    return [];
  }

  const allAchievements = Object.keys(getAchievements()).length;
  let userIds = query.map((i) => i.userId);
  const completionRate = new Map<string, number>();

  userIds = [...new Set(userIds)];

  for (const userId of userIds) {
    const achievementsForUser = query.filter((i) => i.userId == userId);

    completionRate.set(userId, (achievementsForUser.length / allAchievements) * 100);
  }

  if (userIds.length > 500) {
    userIds = await workerSort(userIds, completionRate);
    userIds.reverse();
  } else {
    inPlaceSort(userIds).desc((i) => completionRate.get(i));
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

    if (completionRate.get(user) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      usersFinal[count] =
        pos + " **" + getMemberID(guild, user).user.tag + "** " + completionRate.get(user).toFixed(1) + "%";
      count++;
    }
  }
  return usersFinal;
}
