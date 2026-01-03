import { exec } from "child_process";
import { User, WebhookClient } from "discord.js";
import { promisify } from "util";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getTimestamp, logger } from "../../logger";
import { getGuildByUser } from "../economy/guilds";
import { deleteOffer, getTargetedOffers } from "../economy/offers";
import { deleteImage } from "../image";
import { getUserId, MemberResolvable } from "../member";
import { deleteAllAvatars } from "./history";
import { isMarried, removeMarriage } from "./marriage";
import ms = require("ms");

export async function hasProfile(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.user.EXISTS}:${userId}`)) {
    return (await redis.get(`${Constants.redis.cache.user.EXISTS}:${userId}`)) === "true";
  }

  const query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
    },
  });

  if (query) {
    await redis.set(
      `${Constants.redis.cache.user.EXISTS}:${userId}`,
      "true",
      "EX",
      Math.floor(ms("7 day") / 1000),
    );
    return true;
  } else {
    await redis.set(
      `${Constants.redis.cache.user.EXISTS}:${userId}`,
      "false",
      "EX",
      Math.floor(ms("7 day") / 1000),
    );
    return false;
  }
}

export async function createProfile(member: MemberResolvable) {
  const userId = getUserId(member);
  let username = "";
  if (typeof member !== "string") {
    username = member instanceof User ? member.username : member.user.username;
  }

  if (await redis.exists(`${Constants.redis.nypsi.PROFILE_TRANSFER}:${userId}`)) return;

  await prisma.user
    .create({
      data: {
        id: userId,
        lastKnownUsername: username,
        usernameUpdatedAt: new Date(),
        lastCommand: new Date(0),
      },
    })
    .catch(() => {});
  await redis.del(`${Constants.redis.cache.user.EXISTS}:${userId}`);
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
        if (user.email) delete user.email;
        await prisma.user.create({ data: { ...user, id: toId } });

        const premium = await prisma.premium
          .findUnique({ where: { userId: fromId } })
          .catch(() => {});
        if (premium) {
          await prisma.premium.create({ data: { ...premium, userId: toId } });

          await prisma.userAlias.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          });
        }

        await prisma.commandUse.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.achievements.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.tags.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.purchases.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        const economy = await prisma.economy.findUnique({ where: { userId: fromId } });
        await prisma.economy.create({ data: { ...economy, userId: toId } });

        const workers = await prisma.economyWorker.findMany({ where: { userId: fromId } });
        if (workers.length > 0) {
          await prisma.economyWorker.createMany({
            data: workers.map((i) => ({ ...i, userId: toId })),
          });
        }

        const workersUpgrades = await prisma.economyWorkerUpgrades.findMany({
          where: { userId: fromId },
        });
        if (workersUpgrades.length > 0) {
          await prisma.economyWorkerUpgrades.createMany({
            data: workersUpgrades.map((i) => ({ ...i, userId: toId })),
          });
        }

        const farm = await prisma.farm.findMany({ where: { userId: fromId } });

        if (farm.length > 0) {
          await prisma.farm.deleteMany({ where: { userId: fromId } });
          await prisma.farm.createMany({ data: farm.map((i) => ({ ...i, userId: toId })) });
        }

        const farmUpgrades = await prisma.farmUpgrades.findMany({ where: { userId: fromId } });
        if (farmUpgrades.length > 0) {
          await prisma.farmUpgrades.deleteMany({ where: { userId: fromId } });
          await prisma.farmUpgrades.createMany({
            data: farmUpgrades.map((i) => ({ ...i, userId: toId })),
          });
        }

        await prisma.inventory.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.crafting.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.bakeryUpgrade.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.upgrades.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.tradeRequest.updateMany({
          where: { ownerId: fromId },
          data: { ownerId: toId },
        });

        await prisma.market.updateMany({ where: { ownerId: fromId }, data: { ownerId: toId } });

        await prisma.eventContribution.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });

        await prisma.tmdbRatings.updateMany({
          where: { userId: fromId },
          data: { userId: toId },
        });
      },
      { maxWait: 60000, timeout: 60000 },
    )
    .catch((e) => {
      logger.error(`transfer failed (${fromId} -> ${toId})`, e);
      console.error(e);
      fail = true;
    });
  if (fail) return;

  await dataDelete(fromId);
  exec(`redis-cli KEYS "*${toId}*" | xargs redis-cli DEL`);
  logger.info(`transfer complete (${fromId} -> ${toId})`);
}

export async function dataDelete(member: MemberResolvable) {
  const userId = getUserId(member);
  logger.info(`deleting data for ${userId}...`);
  await deleteAllAvatars(userId);

  const guild = await getGuildByUser(userId);

  if (guild && guild.ownerId === userId) {
    if (guild.avatarId) await deleteImage(guild.avatarId);
  }

  const offers = await getTargetedOffers(userId);

  for (const offer of offers) {
    await deleteOffer(offer);
  }

  if (await isMarried(userId)) {
    await removeMarriage(userId);
  }

  await prisma.user
    .delete({
      where: {
        id: userId,
      },
    })
    .catch(() => {});

  const execCmd = promisify(exec);

  await execCmd(`redis-cli KEYS "*${userId}*" | xargs redis-cli DEL`);

  if (guild) {
    await execCmd(`redis-cli KEYS "*${guild.guildName}*" | xargs redis-cli DEL`);
  }

  logger.info(`data deleted for ${userId}`);

  const hook = new WebhookClient({
    url: process.env.ANTICHEAT_HOOK,
  });
  await hook.send({ content: `[${getTimestamp()}] \`${userId}\` data deleted` });
  hook.destroy();
}
