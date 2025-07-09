import { PutObjectCommand } from "@aws-sdk/client-s3";
import { User } from "discord.js";
import { nanoid } from "nanoid";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import s3 from "../../../init/s3";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getRawLevel } from "../economy/levelling";
import { isEcoBanned } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";
import sleep from "../sleep";
import { addNewAvatar, addNewUsername, fetchUsernameHistory, isTracking } from "./history";
import { getLastKnownAvatar, getLastKnownUsername } from "./tag";
import ms = require("ms");

export const recentCommands = new Map<string, number>();

setInterval(async () => {
  logger.debug(`recent commands size: ${recentCommands.size}`);

  let count = 0;

  for (const [key, value] of recentCommands.entries()) {
    await sleep(10);

    if (Date.now() - value > ms("10 days")) {
      recentCommands.delete(key);
      count++;
    }
  }

  if (count > 0) logger.debug(`${count} deleted from recent commands`);
}, ms("1 hour"));

export async function getLastCommand(member: MemberResolvable): Promise<Date> {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.user.LAST_COMMAND}:${userId}`))
    return new Date(
      parseInt(await redis.get(`${Constants.redis.cache.user.LAST_COMMAND}:${userId}`)),
    );

  const query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      lastCommand: true,
    },
  });

  if (!query || !query.lastCommand) {
    return new Date(0);
  }

  await redis.set(
    `${Constants.redis.cache.user.LAST_COMMAND}:${userId}`,
    query.lastCommand.getTime(),
    "EX",
    ms("30 minutes") / 1000,
  );

  return query.lastCommand;
}

export async function getCommandUses(member: MemberResolvable) {
  const query = await prisma.commandUse.findMany({
    where: {
      userId: getUserId(member),
    },
    orderBy: {
      uses: "desc",
    },
  });

  return query;
}

export async function updateUser(user: User, command: string) {
  if (!user) return;
  const date = new Date();
  recentCommands.set(user.id, date.getTime());

  await redis.set(
    `${Constants.redis.cache.user.LAST_COMMAND}:${user.id}`,
    date.getTime(),
    "EX",
    1800,
  );

  const [username, avatar] = await Promise.all([
    getLastKnownUsername(user.id),
    getLastKnownAvatar(user.id),
  ]);

  let updateUsername = false;
  let updateAvatar = false;

  if (username !== user.username) {
    updateUsername = true;
    if (await isTracking(user.id)) {
      const history = await fetchUsernameHistory(user.id, 1);

      if (history[0]?.value !== username) {
        addNewUsername(user.id, username);
      }
    }
  }

  const newAvatar = user.displayAvatarURL({ size: 256, extension: "png" });

  if (newAvatar !== avatar && user.client.user.id === Constants.BOT_USER_ID) {
    await redis.set(`${Constants.redis.cache.user.avatar}:${user.id}`, newAvatar);

    updateAvatar = true;
    const level = await getRawLevel(user.id).catch(() => 0);
    if (
      level >= 500 &&
      (await isTracking(user.id)) &&
      !(await isEcoBanned(user.id)
        .then((r) => r.banned)
        .catch(() => false))
    ) {
      (async () => {
        const arrayBuffer = await fetch(newAvatar).then((r) => r.arrayBuffer());
        const ext = newAvatar.split(".").pop().split("?")[0];
        const key = `avatar/${user.id}/${nanoid()}.${ext}`;

        const res = await s3
          .send(
            new PutObjectCommand({
              Bucket: process.env.S3_BUCKET,
              Key: key,
              Body: Buffer.from(arrayBuffer),
              ContentType: `image/${ext}`,
            }),
          )
          .catch((err) => {
            console.error(err);
            logger.error(`failed to upload new avatar for ${user.id} (${username})`, { err });
          });

        if (!res) return;

        await addNewAvatar(user.id, `https://cdn.nypsi.xyz/${key}`);
        logger.debug(`uploaded new avatar for ${user.id}`);
      })();
    }
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastCommand: date,
      lastKnownUsername: updateUsername ? user.username : undefined,
      avatar: updateAvatar ? newAvatar : undefined,
      CommandUse: {
        upsert: {
          where: {
            userId_command: {
              command,
              userId: user.id,
            },
          },
          update: {
            command,
            uses: { increment: 1 },
          },
          create: {
            command,
            uses: 1,
          },
        },
      },
    },
  });
}
