import { EconomyGuildUpgrades } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { GuildUpgradeRequirements } from "../../../types/Economy";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addInventoryItem } from "./inventory";
import ms = require("ms");

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
                lastKnownTag: true,
              },
            },
          },
        },
        members: {
          include: {
            economy: {
              select: {
                user: {
                  select: {
                    lastKnownTag: true,
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

    await redis.set(`${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`, guild.level);
    await redis.expire(
      `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
      Math.floor(ms("1 hour") / 1000)
    );

    return guild.level;
  }

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_LEVEL}:${guildName.toLowerCase()}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.economy.GUILD_LEVEL}:${guildName.toLowerCase()}`));
  } else {
    const guild = await getGuildByName(guildName);

    if (!guild) return 0;

    await redis.set(`${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`, guild.level);
    await redis.expire(
      `${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`,
      Math.floor(ms("1 hour") / 1000)
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
              include: {
                economy: {
                  select: {
                    user: {
                      select: {
                        lastKnownTag: true,
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
                    lastKnownTag: true,
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
    },
  });

  return checkUpgrade(name);
}

export async function addToGuildXP(name: string, amount: number, member: GuildMember) {
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
      userId: member.user.id,
    },
    data: {
      contributedXp: { increment: amount },
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

export async function getRequiredForGuildUpgrade(name: string): Promise<GuildUpgradeRequirements> {
  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`));
  }

  const guild = await getGuildByName(name);

  const baseMoney = 3000000 * Math.pow(guild.level, 2.07);
  const baseXP = 1750 * Math.pow(guild.level, 1.77);

  const bonusMoney = 100000 * guild.members.length;
  const bonusXP = 75 * guild.members.length;

  await redis.set(
    `${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`,
    JSON.stringify({
      money: Math.floor(baseMoney + bonusMoney),
      xp: Math.floor(baseXP + bonusXP),
    })
  );
  await redis.expire(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${name}`, ms("1 hour") / 1000);

  return {
    money: Math.floor(baseMoney + bonusMoney),
    xp: Math.floor(baseXP + bonusXP),
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
        lastKnownTag: member,
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
  xp: number;
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
}

async function checkUpgrade(guild: EconomyGuild | string): Promise<boolean> {
  if (typeof guild == "string") {
    guild = await getGuildByName(guild);
  }

  if (guild.level >= Constants.MAX_GUILD_LEVEL) return;
  const requirements = await getRequiredForGuildUpgrade(guild.guildName);

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

    logger.info(`${guild.guildName} has upgraded to level ${guild.level + 1}`);

    await redis.del(`${Constants.redis.cache.economy.GUILD_REQUIREMENTS}:${guild.guildName}`);
    await redis.del(`${Constants.redis.cache.economy.GUILD_LEVEL}:${guild.guildName.toLowerCase()}`);

    const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

    const desc = [`**${guild.guildName}** has upgraded to level **${guild.level + 1}**\n\nyou have received:`];

    let cratesEarned = Math.floor(guild.level / 1.75);

    if (cratesEarned < 1) cratesEarned = 1;
    if (cratesEarned > 5) cratesEarned = 5;

    desc.push(` +**${cratesEarned}** 69420 crates`);
    desc.push(" +**1** upgrade token");

    embed.setHeader(guild.guildName);
    embed.setDescription(desc.join("\n"));
    embed.disableFooter();

    const payload: NotificationPayload = {
      memberId: "boob",
      payload: {
        content: `${guild.guildName} has levelled up!`,
        embed: embed,
      },
    };

    for (const member of guild.members) {
      await addInventoryItem(member.userId, "69420_crate", cratesEarned, false);

      if ((await getDmSettings(member.userId)).other) {
        payload.memberId = member.userId;
        addNotificationToQueue(payload);
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

export async function getGuildUpgradesByUser(member: GuildMember | string): Promise<EconomyGuildUpgrades[]> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (!(await redis.exists(`${Constants.redis.cache.economy.GUILD_USER}:${id}`))) {
    const guild = await getGuildByUser(member);

    if (!guild) return [];

    await redis.set(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`, JSON.stringify(guild.upgrades));
    await redis.expire(
      `${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`,
      Math.floor(ms("6 hours") / 1000)
    );

    return guild.upgrades;
  }

  const guildName = await redis.get(`${Constants.redis.cache.economy.GUILD_USER}:${id}`);

  if (guildName === "noguild") return [];

  if (await redis.exists(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guildName}`))
    return JSON.parse(await redis.get(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guildName}`));

  const guild = await getGuildByName(guildName);

  if (!guild) return [];

  await redis.set(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`, JSON.stringify(guild.upgrades));
  await redis.expire(`${Constants.redis.cache.economy.GUILD_UPGRADES}:${guild.guildName}`, Math.floor(ms("6 hours") / 1000));

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
