import { exec } from "child_process";
import { GuildMember, User } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { deleteAllAvatars } from "./history";
import ms = require("ms");

export async function hasProfile(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.EXISTS}:${id}`)) {
    return (await redis.get(`${Constants.redis.cache.user.EXISTS}:${id}`)) === "true"
      ? true
      : false;
  }

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      id: true,
    },
  });

  if (query) {
    await redis.set(`${Constants.redis.cache.user.EXISTS}:${id}`, "true");
    await redis.expire(
      `${Constants.redis.cache.user.EXISTS}:${id}`,
      Math.floor(ms("7 day") / 1000),
    );
    return true;
  } else {
    await redis.set(`${Constants.redis.cache.user.EXISTS}:${id}`, "false");
    await redis.expire(
      `${Constants.redis.cache.user.EXISTS}:${id}`,
      Math.floor(ms("7 day") / 1000),
    );
    return false;
  }
}

export async function createProfile(member: User | string) {
  let id: string;
  let username = "";
  if (member instanceof User) {
    username = `${member.username}`;
    id = member.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${id}`)) return;

  await prisma.user
    .create({
      data: {
        id: id,
        lastKnownUsername: username,
        lastCommand: new Date(0),
      },
    })
    .catch(() => {});
  await redis.del(`${Constants.redis.cache.user.EXISTS}:${id}`);
}

export async function doProfileTransfer(fromId: string, toId: string) {
  logger.info(`beginning transfer (${fromId} -> ${toId})`);
  await redis.del(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${fromId}`);
  await redis.del(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${toId}`);

  await dataDelete(toId);

  let fail = false;

  await prisma
    .$transaction(
      async (prisma) => {
        const user = await prisma.user.findUnique({ where: { id: fromId } });
        user.id = toId;
        if (user.email) delete user.email;
        await prisma.user.create({ data: user });

        const premium = await prisma.premium
          .findUnique({ where: { userId: fromId } })
          .catch(() => {});
        if (premium) {
          premium.userId = toId;
          await prisma.premium.create({ data: premium });
        }

        const commandUses = (await prisma.commandUse.findMany({ where: { userId: fromId } })).map(
          (i) => {
            i.userId = toId;
            return i;
          },
        );
        if (commandUses.length > 0) {
          await prisma.commandUse.createMany({ data: commandUses });
        }

        const achievements = (
          await prisma.achievements.findMany({ where: { userId: fromId } })
        ).map((i) => {
          i.userId = toId;
          return i;
        });
        if (achievements.length > 0) {
          await prisma.achievements.createMany({ data: achievements });
        }

        const tags = (await prisma.tags.findMany({ where: { userId: fromId } })).map((i) => {
          i.userId = toId;
          return i;
        });
        if (tags.length > 0) {
          await prisma.tags.createMany({ data: tags });
        }

        const purchases = (await prisma.purchases.findMany({ where: { userId: fromId } })).map(
          (i) => {
            i.userId = toId;
            return i;
          },
        );
        if (purchases.length > 0) {
          await prisma.purchases.deleteMany({
            where: { id: { in: purchases.map((i) => i.id) } },
          });
          await prisma.purchases.createMany({ data: purchases });
        }

        const economy = await prisma.economy.findUnique({ where: { userId: fromId } });
        economy.userId = toId;
        await prisma.economy.create({ data: economy });

        const workers = (await prisma.economyWorker.findMany({ where: { userId: fromId } })).map(
          (i) => {
            i.userId = toId;
            return i;
          },
        );
        if (workers.length > 0) {
          await prisma.economyWorker.createMany({ data: workers });
        }

        const workersUpgrades = (
          await prisma.economyWorkerUpgrades.findMany({ where: { userId: fromId } })
        ).map((i) => {
          i.userId = toId;
          return i;
        });
        if (workersUpgrades.length > 0) {
          await prisma.economyWorkerUpgrades.createMany({ data: workersUpgrades });
        }

        const cars = (
          await prisma.customCar.findMany({
            where: { userId: fromId },
            include: { upgrades: true },
          })
        ).map((i) => {
          i.userId = toId;
          return i;
        });
        if (cars.length > 0) {
          await prisma.customCar.deleteMany({ where: { userId: fromId } });
          await prisma.customCar.createMany({ data: cars });
        }

        const farm = (await prisma.farm.findMany({ where: { userId: fromId } })).map((i) => {
          i.userId = toId;
          return i;
        });

        if (farm.length > 0) {
          await prisma.farm.deleteMany({ where: { userId: fromId } });
          await prisma.farm.createMany({ data: farm });
        }

        const farmUpgrades = (
          await prisma.farmUpgrades.findMany({ where: { userId: fromId } })
        ).map((i) => {
          i.userId = toId;
          return i;
        });

        if (farmUpgrades.length > 0) {
          await prisma.farmUpgrades.deleteMany({ where: { userId: fromId } });
          await prisma.farmUpgrades.createMany({ data: farmUpgrades });
        }

        const inventory = (await prisma.inventory.findMany({ where: { userId: fromId } })).map(
          (i) => {
            i.userId = toId;
            return i;
          },
        );
        if (inventory.length > 0) {
          await prisma.inventory.createMany({ data: inventory });
        }

        const crafting = (await prisma.crafting.findMany({ where: { userId: fromId } })).map(
          (i) => {
            i.userId = toId;
            return i;
          },
        );
        if (crafting.length > 0) {
          await prisma.crafting.deleteMany({ where: { id: { in: crafting.map((i) => i.id) } } });
          await prisma.crafting.createMany({ data: crafting });
        }

        const games = (await prisma.game.findMany({ where: { userId: fromId } })).map((i) => {
          i.userId = toId;
          return i;
        });
        if (games.length > 0) {
          await prisma.game.deleteMany({ where: { id: { in: games.map((i) => i.id) } } });
          await prisma.game.createMany({ data: games });
        }

        const stats = (await prisma.stats.findMany({ where: { userId: fromId } })).map((i) => {
          i.userId = toId;
          return i;
        });
        if (stats.length > 0) {
          await prisma.stats.createMany({ data: stats });
        }

        const bakery = (await prisma.bakeryUpgrade.findMany({ where: { userId: fromId } })).map(
          (i) => {
            i.userId = toId;
            return i;
          },
        );
        if (bakery.length > 0) {
          await prisma.bakeryUpgrade.createMany({ data: bakery });
        }

        const upgrades = (await prisma.upgrades.findMany({ where: { userId: fromId } })).map(
          (i) => {
            i.userId = toId;
            return i;
          },
        );
        if (upgrades.length > 0) {
          await prisma.upgrades.createMany({ data: upgrades });
        }
      },
      { maxWait: 30000, timeout: 30000 },
    )
    .catch((e) => {
      logger.error(`transfer failed (${fromId} -> ${toId})`, e);
      fail = true;
    });
  if (fail) return;

  await dataDelete(fromId);
  exec(`redis-cli KEYS "*${toId}*" | xargs redis-cli DEL`);
  logger.info(`transfer complete (${fromId} -> ${toId})`);
}

export async function dataDelete(userId: string) {
  logger.info(`deleting data for ${userId}...`);
  await deleteAllAvatars(userId);

  await prisma.inventory.deleteMany({
    where: {
      userId: userId,
    },
  });

  await prisma.booster.deleteMany({
    where: {
      userId: userId,
    },
  });

  await prisma.economyGuildMember.deleteMany({
    where: {
      userId: userId,
    },
  });

  await prisma.wordleGame.deleteMany({
    where: {
      userId: userId,
    },
  });

  await prisma.username.deleteMany({
    where: {
      userId: userId,
    },
  });

  await prisma.mention.deleteMany({
    where: {
      targetId: userId,
    },
  });

  await prisma.premiumCommand.deleteMany({
    where: {
      owner: userId,
    },
  });

  await prisma.chatReactionStats.deleteMany({
    where: {
      userId: userId,
    },
  });

  await prisma.auctionWatch.deleteMany({ where: { userId } });

  await prisma.economy
    .delete({
      where: {
        userId: userId,
      },
    })
    .catch(() => {});

  await prisma.premium
    .delete({
      where: {
        userId: userId,
      },
    })
    .catch(() => {});

  await prisma.user
    .delete({
      where: {
        id: userId,
      },
    })
    .catch(() => {});

  logger.info(`data deleted for ${userId}`);

  return new Promise((resolve) => {
    exec(`redis-cli KEYS "*${userId}*" | xargs redis-cli DEL`, () => resolve(0));
  });
}
