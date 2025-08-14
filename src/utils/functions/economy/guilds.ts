import { EconomyGuildUpgrades } from "@prisma/client";
import { GuildMember } from "discord.js";
import { sort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { GuildUpgradeRequirements } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { deleteImage } from "../image";
import { getUserId, MemberResolvable } from "../member";
import { Mutex } from "../mutex";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addInventoryItem } from "./inventory";
import { getUpgrades } from "./levelling";
import { getItems, getUpgradesData, isEcoBanned } from "./utils";
import ms = require("ms");

const upgrades = new Map<number, string[]>();

upgrades.set(1, ["69420_crate:1"]);
upgrades.set(3, ["69420_crate:2"]);
upgrades.set(5, ["69420_crate:3"]);
upgrades.set(7, ["69420_crate:4"]);
upgrades.set(9, ["69420_crate:5"]);
upgrades.set(14, ["69420_crate:5", "lucky_scratch_card:1"]);
upgrades.set(24, ["69420_crate:5", "lucky_scratch_card:2"]);
upgrades.set(49, ["69420_crate:5", "lucky_scratch_card:2", "nypsi_crate:1"]);
upgrades.set(99, ["69420_crate:10", "lucky_scratch_card:2", "nypsi_crate:2", "omega_crate:1"]);
upgrades.set(100, ["69420_crate:10", "lucky_scratch_card:2", "nypsi_crate:2"]);
upgrades.set(149, ["69420_crate:10", "lucky_scratch_card:3", "nypsi_crate:2"]);
upgrades.set(174, ["69420_crate:10", "lucky_scratch_card:3", "nypsi_crate:3"]);
upgrades.set(199, ["69420_crate:10", "lucky_scratch_card:4", "nypsi_crate:3", "omega_crate:1"]);
upgrades.set(200, ["69420_crate:10", "lucky_scratch_card:4", "nypsi_crate:3"]);

export async function getGuildByName(name: string) {
  const guild = await prisma.economyGuild
    .findMany({
      where: {
        guildName: {
          mode: "insensitive",
          equals: name,
        },
      },
      include: {
        upgrades: true,
        owner: {
          select: {
            user: {
              select: {
                lastKnownUsername: true,
              },
            },
          },
        },
        members: {
          orderBy: {
            joinedAt: "asc",
          },
          include: {
            economy: {
              select: {
                user: {
                  select: {
                    lastKnownUsername: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    .then((r) => r[0]);

  return guild;
}

export async function getGuildLevelByUser(member: MemberResolvable) {
  const userId = getUserId(member);

  let guildName: string;

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${userId}`)) {
    guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${userId}`);

    if (guildName === "noguild") return 0;
  } else {
    const guild = await getGuildByUser(member);

    if (!guild) return 0;

    await redis.set(
      `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
      guild.level,
      "EX",
      Math.floor(ms("1 hour") / 1000),
    );

    return guild.level;
  }

  if (
    await redis.exists(`${Constants.redis.cache.economy.GUILD_LEVEL}:${guildName.toLowerCase()}`)
  ) {
    return parseInt(
      await redis.get(`${Constants.redis.cache.economy.GUILD_LEVEL}:${guildName.toLowerCase()}`),
    );
  } else {
    const guild = await getGuildByName(guildName);

    if (!guild) return 0;

    await redis.set(
      `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
      guild.level,
      "EX",
      Math.floor(ms("1 hour") / 1000),
    );

    return guild.level;
  }
}

export async function getGuildByUser(member: MemberResolvable) {
  const userId = getUserId(member);

  let guildName: string;

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${userId}`)) {
    guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${userId}`);

    if (guildName == "noguild") return undefined;
  } else {
    const query = await prisma.economyGuildMember.findUnique({
      where: {
        userId,
      },
      include: {
        guild: {
          include: {
            upgrades: true,
            members: {
              orderBy: {
                joinedAt: "asc",
              },
              include: {
                economy: {
                  select: {
                    user: {
                      select: {
                        lastKnownUsername: true,
                      },
                    },
                  },
                },
              },
            },
            owner: {
              select: {
                user: {
                  select: {
                    lastKnownUsername: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!query || !query.guild) {
      await redis.set(
        `${Constants.redis.cache.economy.GUILD_USER}:${userId}`,
        "noguild",
        "EX",
        ms("1 hour") / 1000,
      );
      return undefined;
    } else {
      await redis.set(
        `${Constants.redis.cache.economy.GUILD_USER}:${userId}`,
        query.guild.guildName,
        "EX",
        ms("1 hour") / 1000,
      );
    }

    return query.guild;
  }

  return await getGuildByName(guildName);
}

export async function promoteGuildMember(name: string, member: GuildMember) {
  await prisma.economyGuildMember.update({
    where: {
      userId: member.id,
    },
    data: {
      role: "admin",
    },
  });
}

export async function demoteGuildMember(name: string, member: GuildMember) {
  await prisma.economyGuildMember.update({
    where: {
      userId: member.id,
    },
    data: {
      role: "member",
    },
  });
}

export async function createGuild(name: string, owner: GuildMember) {
  await prisma.economyGuild.create({
    data: {
      guildName: name,
      createdAt: new Date(),
      ownerId: owner.id,
    },
  });
  await prisma.economyGuildMember.create({
    data: {
      userId: owner.id,
      guildName: name,
      joinedAt: new Date(),
      role: "owner",
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${owner.id}`);
}

export async function deleteGuild(name: string) {
  const guild = await getGuildByName(name);

  if (!guild) return;

  if (guild.avatarId) await deleteImage(guild.avatarId);

  for (const member of guild.members) {
    await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${member.userId}`);
  }

  await prisma.economyGuildMember.deleteMany({
    where: {
      guildName: name,
    },
  });

  await prisma.economyGuild.delete({
    where: {
      guildName: name,
    },
  });

  await prisma.economyGuildUpgrades.deleteMany({
    where: { guildName: name },
  });

  await prisma.graphMetrics.deleteMany({
    where: {
      AND: [{ category: { contains: "guild" } }, { userId: guild.guildName }],
    },
  });
}

export async function addToGuildBank(name: string, amount: number, member: MemberResolvable) {
  await prisma.economyGuild.update({
    where: {
      guildName: name,
    },
    data: {
      balance: { increment: amount },
    },
  });
  await prisma.economyGuildMember.update({
    where: {
      userId: getUserId(member),
    },
    data: {
      contributedMoney: { increment: amount },
      contributedMoneyThisLevel: { increment: amount },
      contributedMoneyToday: { increment: amount },
    },
  });

  return checkUpgrade(name);
}

export async function addToGuildXP(name: string, amount: number, member: MemberResolvable) {
  const upgrades = await getUpgrades(member);

  if (upgrades.find((i) => i.upgradeId === "guild_xp"))
    amount += Math.floor(
      amount *
        (upgrades.find((i) => i.upgradeId === "guild_xp").amount *
          getUpgradesData()["guild_xp"].effect),
    );

  await prisma.economyGuild.update({
    where: {
      guildName: name,
    },
    data: {
      xp: { increment: amount },
    },
  });
  await prisma.economyGuildMember.update({
    where: {
      userId: getUserId(member),
    },
    data: {
      contributedXp: { increment: amount },
      contributedXpThisLevel: { increment: amount },
      contributedXpToday: { increment: amount },
    },
  });

  return checkUpgrade(name);
}

export async function getMaxMembersForGuild(name: string) {
  const guild = await getGuildByName(name);

  let slots = 4;

  if (guild.upgrades.find((i) => i.upgradeId === "member"))
    slots += guild.upgrades.find((i) => i.upgradeId === "member").amount;

  return slots;
}

export async function getRequiredForGuildUpgrade(
  name: string,
  cache = true,
): Promise<GuildUpgradeRequirements> {
  if (
    (await redis.exists(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`)) &&
    cache
  ) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`),
    );
  }

  const guild = await getGuildByName(name);

  const money = 3000000 * Math.pow(guild.level, 2.1125);
  const xp = 1750 * Math.pow(guild.level, 1.81225);

  let slots = guild.upgrades.find((i) => i.upgradeId === "member")?.amount || 0;

  if (slots < guild.members.length - 4) {
    slots = guild.members.length;
  }

  const bonusMoney = 50_000_000 * slots * (guild.level / 10);
  const bonusXP = 10_000 * slots * (guild.level / 10);

  await redis.set(
    `${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`,
    JSON.stringify({
      money: Math.floor(money + bonusMoney),
      xp: Math.floor(xp + bonusXP),
      members: guild.members.length,
    }),
    "EX",
    ms("1 hour") / 1000,
  );

  return {
    money: Math.floor(money + bonusMoney),
    xp: Math.floor(xp + bonusXP),
    members: guild.members.length,
  };
}

export async function addMember(name: string, member: GuildMember) {
  const guild = await getGuildByName(name);

  if (guild.members.length + 1 > (await getMaxMembersForGuild(guild.guildName))) {
    return false;
  }

  await prisma.economyGuildMember.create({
    data: {
      userId: member.user.id,
      guildName: guild.guildName,
      joinedAt: new Date(),
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${member.user.id}`);

  return true;
}

export async function removeMember(member: string) {
  await prisma.economyGuildMember.delete({
    where: {
      userId: member,
    },
  });
  await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${member}`);
}

interface EconomyGuild {
  guildName: string;
  createdAt: Date;
  balance: bigint;
  xp: bigint;
  level: number;
  motd: string;
  ownerId: string;
  members?: EconomyGuildMember[];
}

interface EconomyGuildMember {
  userId: string;
  guildName: string;
  joinedAt: Date;
  contributedMoney: bigint;
  contributedXp: number;
  contributedMoneyThisLevel: bigint;
  contributedXpThisLevel: number;
}

const checkUpgradeMutex = new Mutex();

async function checkUpgrade(guild: EconomyGuild | string): Promise<boolean> {
  if (await redis.exists("nypsi:infinitemaxbet")) return false;

  if (typeof guild == "string") {
    guild = await getGuildByName(guild);
  }

  await checkUpgradeMutex.acquire(guild.guildName);
  try {
    if (guild.level >= Constants.MAX_GUILD_LEVEL) return;
    let requirements = await getRequiredForGuildUpgrade(guild.guildName);
    if (guild.members?.length !== requirements.members)
      requirements = await getRequiredForGuildUpgrade(guild.guildName, false);

    if (Number(guild.balance) >= requirements.money && guild.xp >= requirements.xp) {
      await prisma.economyGuild.update({
        where: {
          guildName: guild.guildName,
        },
        data: {
          level: { increment: 1 },
          tokens: { increment: 1 },
        },
      });

      await prisma.economyGuildMember.updateMany({
        where: {
          guildName: guild.guildName,
        },
        data: {
          contributedMoneyThisLevel: 0,
          contributedXpThisLevel: 0,
        },
      });

      logger.info(`${guild.guildName} has upgraded to level ${guild.level + 1}`);

      await redis.del(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${guild.guildName}`);
      await redis.del(
        `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
      );

      const upgradeMsg = `**${guild.guildName}** has upgraded to level **${guild.level + 1}**`;

      let rewards = upgrades.get(guild.level);

      while (!rewards) rewards = upgrades.get(guild.level--);

      const dms: { id: string; embed: CustomEmbed }[] = [];

      for (const member of guild.members) {
        dms.push({
          id: member.userId,
          embed: new CustomEmbed()
            .setColor(Constants.EMBED_SUCCESS_COLOR)
            .setDescription(`${upgradeMsg}`),
        });
      }

      const top4Xp = sort(guild.members)
        .desc((i) => i.contributedXp)
        .slice(0, 4)
        .filter((i) => i.contributedXp > 0);

      const top4Money = sort(guild.members)
        .desc((i) => i.contributedMoney)
        .slice(0, 4)
        .filter((i) => i.contributedMoney > 0);

      for (const member of top4Xp) {
        if ((await isEcoBanned(member.userId)).banned) continue;
        const desc: string[] = [];
        for (const reward of rewards) {
          const [itemId, amount] = reward.split(":");
          await addInventoryItem(member.userId, itemId, parseInt(amount) || 0);
          desc.push(`\`${amount}x\` ${getItems()[itemId].emoji} ${getItems()[itemId].name}`);
        }

        dms.find((i) => i.id === member.userId).embed.data.description +=
          `\n\nas you are a **top 4 xp** contributor you have received:\n${desc.join("\n")}`;
      }

      for (const member of top4Money) {
        if ((await isEcoBanned(member.userId)).banned) continue;
        const desc: string[] = [];
        for (const reward of rewards) {
          const [itemId, amount] = reward.split(":");
          await addInventoryItem(member.userId, itemId, parseInt(amount) || 0);
          desc.push(`\`${amount}x\` ${getItems()[itemId].emoji} ${getItems()[itemId].name}`);
        }

        dms.find((i) => i.id === member.userId).embed.data.description +=
          `\n\nas you are a **top 4 money** contributor you have received:\n${desc.join("\n")}`;
      }

      for (const dm of dms) {
        dm.embed.setAuthor({ name: guild.guildName });
        dm.embed.data.description += `\n\nyou contributed ${guild.members
          .find((i) => i.userId === dm.id)
          .contributedXpThisLevel.toLocaleString()}xp | $${guild.members
          .find((i) => i.userId === dm.id)
          .contributedMoneyThisLevel.toLocaleString()} for this level`;

        if ((await getDmSettings(dm.id)).other) {
          addNotificationToQueue({
            memberId: dm.id,
            payload: {
              embed: dm.embed,
              content: `${guild.guildName} has levelled up!`,
            },
          });
        }
      }

      return true;
    }
    return false;
  } finally {
    checkUpgradeMutex.release(guild.guildName);
  }
}

export async function setGuildMOTD(name: string, motd: string) {
  await prisma.economyGuild.update({
    where: {
      guildName: name,
    },
    data: {
      motd: motd,
    },
  });
}

export async function setOwner(name: string, newOwner: string) {
  const guild = await getGuildByName(name);

  if (!guild) return "invalid guild";

  if (guild.ownerId == newOwner) return "user is already guild owner";

  const res = await prisma.economyGuildMember.updateMany({
    where: {
      guildName: {
        mode: "insensitive",
        equals: name,
      },
      userId: newOwner,
    },
    data: {
      role: "owner",
    },
  });

  if (res.count == 0) return "invalid guild member";

  await prisma.economyGuildMember.update({
    where: {
      userId: guild.ownerId,
    },
    data: {
      role: "admin",
    },
  });

  await prisma.economyGuild.updateMany({
    where: {
      guildName: {
        mode: "insensitive",
        equals: name,
      },
    },
    data: {
      ownerId: newOwner,
    },
  });

  return true;
}

export async function getGuildUpgradesByUser(
  member: MemberResolvable,
): Promise<EconomyGuildUpgrades[]> {
  const userId = getUserId(member);

  if (!(await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${userId}`))) {
    const guild = await getGuildByUser(member);

    if (!guild) return [];

    await redis.set(
      `${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`,
      JSON.stringify(guild.upgrades),
      "EX",
      Math.floor(ms("6 hours") / 1000),
    );

    return guild.upgrades;
  }

  const guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${userId}`);

  if (guildName === "noguild") return [];

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guildName}`))
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guildName}`),
    );

  const guild = await getGuildByName(guildName);

  if (!guild) return [];

  await redis.set(
    `${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`,
    JSON.stringify(guild.upgrades),
    "EX",
    Math.floor(ms("6 hours") / 1000),
  );

  return guild.upgrades;
}

export async function addGuildUpgrade(guildName: string, upgradeId: string) {
  await prisma.economyGuildUpgrades.upsert({
    where: {
      guildName_upgradeId: {
        guildName,
        upgradeId,
      },
    },
    update: {
      amount: { increment: 1 },
    },
    create: {
      guildName,
      upgradeId,
      amount: 1,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guildName}`);
}

export async function getGuildName(member: MemberResolvable) {
  const cache = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${getUserId(member)}`);

  if (cache) {
    if (cache === "noguild") return null;
    return cache;
  } else {
    const guild = await getGuildByUser(member);

    if (guild) return guild.guildName;
  }
}
