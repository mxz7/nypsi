import { EconomyGuildUpgrades } from "@prisma/client";
import { GuildMember } from "discord.js";
import { sort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { GuildUpgradeRequirements } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addInventoryItem } from "./inventory";
import { getUpgrades } from "./levelling";
import { getItems, getUpgradesData, isEcoBanned } from "./utils";
import ms = require("ms");

const upgrades = new Map<number, string[]>();

upgrades.set(1, ["69420_crate:2"]);
upgrades.set(2, ["69420_crate:3"]);
upgrades.set(3, ["69420_crate:4"]);
upgrades.set(4, ["69420_crate:5"]);
upgrades.set(9, ["69420_crate:5", "lucky_scratch_card:1"]);
upgrades.set(24, ["69420_crate:5", "lucky_scratch_card:2"]);
upgrades.set(39, ["69420_crate:5", "lucky_scratch_card:2", "nypsi_crate:1"]);
upgrades.set(99, ["69420_crate:10", "lucky_scratch_card:2", "nypsi_crate:2"]);

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

export async function getGuildLevelByUser(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let guildName: string;

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${id}`)) {
    guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${id}`);

    if (guildName === "noguild") return 0;
  } else {
    const guild = await getGuildByUser(member);

    if (!guild) return 0;

    await redis.set(
      `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
      guild.level,
    );
    await redis.expire(
      `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
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
    );
    await redis.expire(
      `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
      Math.floor(ms("1 hour") / 1000),
    );

    return guild.level;
  }
}

export async function getGuildByUser(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let guildName: string;

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${id}`)) {
    guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${id}`);

    if (guildName == "noguild") return undefined;
  } else {
    const query = await prisma.economyGuildMember.findUnique({
      where: {
        userId: id,
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
      await redis.set(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, "noguild");
      await redis.expire(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, ms("1 hour") / 1000);
      return undefined;
    } else {
      await redis.set(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, query.guild.guildName);
      await redis.expire(`${Constants.redis.cache.economy.GUILD_USER}:${id}`, ms("1 hour") / 1000);
    }

    return query.guild;
  }

  return await getGuildByName(guildName);
}

export async function createGuild(name: string, owner: GuildMember) {
  await prisma.economyGuild.create({
    data: {
      guildName: name,
      createdAt: new Date(),
      ownerId: owner.user.id,
    },
  });
  await prisma.economyGuildMember.create({
    data: {
      userId: owner.user.id,
      guildName: name,
      joinedAt: new Date(),
    },
  });

  await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${owner.user.id}`);
}

export async function deleteGuild(name: string) {
  const guild = await getGuildByName(name);

  if (!guild) return;

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

export async function addToGuildBank(name: string, amount: number, member: GuildMember) {
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
      userId: member.user.id,
    },
    data: {
      contributedMoney: { increment: amount },
      contributedMoneyThisLevel: { increment: amount },
    },
  });

  return checkUpgrade(name);
}

export async function addToGuildXP(name: string, amount: number, member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

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
      userId: id,
    },
    data: {
      contributedXp: { increment: amount },
      contributedXpThisLevel: { increment: amount },
    },
  });

  return checkUpgrade(name);
}

export async function getMaxMembersForGuild(name: string) {
  const guild = await getGuildByName(name);

  let slots = 5;

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

  const baseMoney = 3000000 * Math.pow(guild.level, 2.1);
  const baseXP = 1750 * Math.pow(guild.level, 1.8);

  const bonusMoney = 1000000 * guild.members.length * Math.floor(guild.level / 7);
  const bonusXP = 2500 * guild.members.length * Math.floor(guild.level / 7);

  await redis.set(
    `${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`,
    JSON.stringify({
      money: Math.floor(baseMoney + bonusMoney),
      xp: Math.floor(baseXP + bonusXP),
      members: guild.members.length,
    }),
  );
  await redis.expire(
    `${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`,
    ms("1 hour") / 1000,
  );

  return {
    money: Math.floor(baseMoney + bonusMoney),
    xp: Math.floor(baseXP + bonusXP),
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

export type RemoveMemberMode = "id" | "tag";

export async function removeMember(member: string, mode: RemoveMemberMode) {
  if (mode == "id") {
    await prisma.economyGuildMember.delete({
      where: {
        userId: member,
      },
    });
    await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${member}`);
    return true;
  } else {
    const user = await prisma.user.findFirst({
      where: {
        lastKnownUsername: member,
      },
      select: {
        id: true,
      },
    });

    if (!user || !user.id) {
      return false;
    }

    const x = await prisma.economyGuildMember.delete({
      where: {
        userId: user.id,
      },
    });

    if (x) {
      await redis.del(`${Constants.redis.cache.economy.GUILD_USER}:${x.userId}`);

      return true;
    }
    return false;
  }
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

async function checkUpgrade(guild: EconomyGuild | string): Promise<boolean> {
  if (typeof guild == "string") {
    guild = await getGuildByName(guild);
  }

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

export async function setOwner(guild: string, newOwner: string) {
  await prisma.economyGuild.updateMany({
    where: {
      guildName: {
        mode: "insensitive",
        equals: guild,
      },
    },
    data: {
      ownerId: newOwner,
    },
  });
}

export async function getGuildUpgradesByUser(
  member: GuildMember | string,
): Promise<EconomyGuildUpgrades[]> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (!(await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${id}`))) {
    const guild = await getGuildByUser(member);

    if (!guild) return [];

    await redis.set(
      `${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`,
      JSON.stringify(guild.upgrades),
    );
    await redis.expire(
      `${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`,
      Math.floor(ms("6 hours") / 1000),
    );

    return guild.upgrades;
  }

  const guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${id}`);

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
  );
  await redis.expire(
    `${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`,
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

export async function getGuildName(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const cache = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${id}`);

  if (cache) {
    if (cache === "noguild") return null;
    return cache;
  } else {
    const guild = await getGuildByUser(member);

    if (guild) return guild.guildName;
  }
}
