import dayjs = require("dayjs");
import { Collection, Guild, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import workerSort from "../workers/sort";
import { calcNetWorth } from "./balance";
import { getAchievements, getItems } from "./utils";

export async function topBalance(guild: Guild, userId?: string) {
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
      banned: true,
    },
    orderBy: {
      money: "desc",
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      query.splice(query.indexOf(user), 1);
      continue;
    }
    if (Number(user.money) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      out[count] = pos + " **" + getMemberID(guild, user.userId).user.tag + "** $" + Number(user.money).toLocaleString();
      count++;
    }
  }

  const pages = new Map<number, string[]>();

  for (const line of out) {
    if (pages.size == 0) {
      pages.set(1, [line]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [line]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(line);
        pages.set(pages.size, arr);
      }
    }
  }

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topBalanceGlobal(amount: number, anon = true): Promise<string[]> {
  const query = await prisma.economy.findMany({
    where: {
      money: { gt: 10_000 },
    },
    select: {
      userId: true,
      money: true,
      banned: true,
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

    if (user.banned && dayjs().isBefore(user.banned)) {
      query.splice(query.indexOf(user), 1);
      continue;
    }

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

export async function topNetWorthGlobal(userId: string) {
  const query = await prisma.economy.findMany({
    where: {
      net_worth: { gt: 0 },
    },
    select: {
      userId: true,
      net_worth: true,
      banned: true,
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
    if (user.banned && dayjs().isBefore(user.banned)) {
      query.splice(query.indexOf(user), 1);
      continue;
    }

    let pos: number | string = out.length + 1;

    if (pos == 1) {
      pos = "🥇";
    } else if (pos == 2) {
      pos = "🥈";
    } else if (pos == 3) {
      pos = "🥉";
    }

    out.push(
      pos + " **" + (user.user.lastKnownTag?.split("#")[0] || user.userId) + "** $" + Number(user.net_worth).toLocaleString()
    );
  }

  const pages = new Map<number, string[]>();

  for (const line of out) {
    if (pages.size == 0) {
      pages.set(1, [line]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [line]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(line);
        pages.set(pages.size, arr);
      }
    }
  }

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topNetWorth(guild: Guild, userId?: string) {
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
      userId: { in: Array.from(members.keys()) },
    },
    select: {
      userId: true,
      banned: true,
    },
  });

  const amounts = new Map<string, number>();
  let userIds: string[] = [];

  const promises = [];

  for (const user of query) {
    if (user.banned && dayjs().isBefore(user.banned)) {
      query.splice(query.indexOf(user), 1);
      continue;
    }

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

  const out = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of userIds) {
    if (out.length >= 100) break;

    if (amounts.get(user) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      out[count] = pos + " **" + getMemberID(guild, user).user.tag + "** $" + amounts.get(user).toLocaleString();
      count++;
    }
  }

  const pages = new Map<number, string[]>();

  for (const line of out) {
    if (pages.size == 0) {
      pages.set(1, [line]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [line]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(line);
        pages.set(pages.size, arr);
      }
    }
  }

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topPrestige(guild: Guild, userId?: string) {
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
      banned: true,
    },
    orderBy: {
      prestige: "desc",
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of query) {
    if (user.prestige != 0) {
      if (user.banned && dayjs().isBefore(user.banned)) {
        query.splice(query.indexOf(user), 1);
        continue;
      }

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
      out[count] =
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

  const pages = new Map<number, string[]>();

  for (const line of out) {
    if (pages.size == 0) {
      pages.set(1, [line]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [line]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(line);
        pages.set(pages.size, arr);
      }
    }
  }

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topPrestigeGlobal(userId: string) {
  const query = await prisma.economy.findMany({
    where: {
      prestige: { gt: 0 },
    },
    select: {
      userId: true,
      prestige: true,
      banned: true,
      user: {
        select: {
          lastKnownTag: true,
        },
      },
    },
    orderBy: {
      prestige: "desc",
    },
  });

  const out = [];

  let count = 0;

  for (const user of query) {
    if (user.prestige != 0) {
      if (user.banned && dayjs().isBefore(user.banned)) {
        query.splice(query.indexOf(user), 1);
        continue;
      }

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
      out[count] =
        pos +
        " **" +
        user.user.lastKnownTag.split("#")[0] +
        "** " +
        user.prestige +
        (thing[(v - 20) % 10] || thing[v] || thing[0]) +
        " prestige";
      count++;
    }
  }

  const pages = new Map<number, string[]>();

  for (const line of out) {
    if (pages.size == 0) {
      pages.set(1, [line]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [line]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(line);
        pages.set(pages.size, arr);
      }
    }
  }

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topItem(guild: Guild, item: string, userId: string) {
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
      economy: {
        select: {
          banned: true,
        },
      },
    },
    orderBy: {
      amount: "desc",
    },
    take: 100,
  });

  const out = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of query) {
    if (user.economy.banned && dayjs().isBefore(user.economy.banned)) {
      query.splice(query.indexOf(user), 1);
      continue;
    }

    let pos: number | string = count + 1;

    if (pos == 1) {
      pos = "🥇";
    } else if (pos == 2) {
      pos = "🥈";
    } else if (pos == 3) {
      pos = "🥉";
    }

    const items = getItems();

    out[count] =
      pos +
      " **" +
      getMemberID(guild, user.userId).user.tag +
      "** " +
      user.amount.toLocaleString() +
      ` ${user.amount > 1 ? items[item].plural || items[item].name : items[item].name}`;
    count++;
  }

  const pages = new Map<number, string[]>();

  for (const line of out) {
    if (pages.size == 0) {
      pages.set(1, [line]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [line]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(line);
        pages.set(pages.size, arr);
      }
    }
  }

  let pos = 0;

  if (userId) {
    pos = query.map((i) => i.userId).indexOf(userId) + 1;
  }

  return { pages, pos };
}

export async function topCompletion(guild: Guild, userId: string) {
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
      user: {
        select: {
          Economy: {
            select: {
              banned: true,
            },
          },
        },
      },
    },
  });

  if (query.length == 0) {
    return { pages: new Map<number, string[]>(), pos: 0 };
  }

  const allAchievements = Object.keys(getAchievements()).length;
  let userIds = query.map((i) => i.userId);
  const completionRate = new Map<string, number>();

  userIds = [...new Set(userIds)];

  for (const userId of userIds) {
    if (
      query.find((u) => u.userId).user.Economy.banned &&
      dayjs().isBefore(query.find((u) => u.userId).user.Economy.banned)
    ) {
      userIds.splice(userIds.indexOf(userId), 1);
      continue;
    }

    const achievementsForUser = query.filter((i) => i.userId == userId);

    completionRate.set(userId, (achievementsForUser.length / allAchievements) * 100);
  }

  if (userIds.length > 500) {
    userIds = await workerSort(userIds, completionRate);
    userIds.reverse();
  } else {
    inPlaceSort(userIds).desc((i) => completionRate.get(i));
  }

  const out = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of userIds) {
    if (completionRate.get(user) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      out[count] = pos + " **" + getMemberID(guild, user).user.tag + "** " + completionRate.get(user).toFixed(1) + "%";
      count++;
    }
  }

  const pages = new Map<number, string[]>();

  for (const line of out) {
    if (pages.size == 0) {
      pages.set(1, [line]);
    } else {
      if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [line]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(line);
        pages.set(pages.size, arr);
      }
    }
  }

  let pos = 0;

  if (userId) {
    pos = userIds.indexOf(userId) + 1;
  }

  return { pages, pos };
}
