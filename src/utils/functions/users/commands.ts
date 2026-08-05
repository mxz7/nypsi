import { User } from "discord.js";
import { nanoid } from "nanoid";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { debounce } from "../../debounce";
import { logger } from "../../logger";
import { getRawLevel } from "../economy/levelling";
import { isEcoBanned } from "../economy/utils";
import { setLastCommand } from "../guilds/commands";
import { getUserId, MemberResolvable } from "../member";
import { putObject } from "../s3";
import sleep from "../sleep";
import { addNewAvatar, addNewUsername, fetchUsernameHistory, isTracking } from "./history";
import { getLastKnownAvatar, getLastKnownUsername, updateLastKnownAvatarCache } from "./username";
import ms = require("ms");

export const recentCommands = new Map<string, number>();
const lastCommandCache = new RedisCache<number>(
  Constants.redis.cache.user.LAST_COMMAND,
  ms("30 minutes") / 1000,
);

setInterval(async () => {
  logger.debug(`recent commands: cache size ${recentCommands.size}`, { size: recentCommands.size });

  let count = 0;

  for (const [key, value] of recentCommands.entries()) {
    await sleep(10);

    if (Date.now() - value > ms("10 days")) {
      recentCommands.delete(key);
      count++;
    }
  }

  if (count > 0) logger.debug(`recent commands: deleted ${count} stale entries`, { count });
}, ms("1 hour"));

export async function getLastCommand(member: MemberResolvable): Promise<Date> {
  const userId = getUserId(member);

  const cached = await lastCommandCache.get(userId);
  if (cached !== null) return new Date(cached);

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

  await lastCommandCache.set(userId, query.lastCommand.getTime());

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

const debouncedGuildLastCommand = debounce(async (guildId: string) => {
  await prisma.guild.update({
    where: { id: guildId },
    data: { lastCommand: new Date() },
  });
}, ms("5 minutes"));

export async function updateUser(user: User, command: string, guildId?: string) {
  if (!user) return;

  recentCommands.set(user.id, Date.now());

  const date = new Date();

  const [username, avatar] = await Promise.all([
    getLastKnownUsername(user.id, false, true),
    getLastKnownAvatar(user.id),
  ]);

  await lastCommandCache.set(user.id, date.getTime());

  let updateUsername = false;
  let updateAvatar = false;

  if (
    username.lastKnownUsername !== user.username ||
    username.usernameUpdatedAt.getTime() < date.getTime() - ms("1 week")
  ) {
    updateUsername = true;
    if ((await isTracking(user.id)) && username.lastKnownUsername !== user.username) {
      const history = await fetchUsernameHistory(user.id, 1);

      if (history[0]?.value !== username.lastKnownUsername) {
        addNewUsername(user.id, username.lastKnownUsername);
      }
    }
  }

  const newAvatar = user.displayAvatarURL({ size: 256, extension: "png" });

  if (newAvatar !== avatar && user.client.user.id === Constants.BOT_USER_ID) {
    await updateLastKnownAvatarCache(user.id, newAvatar);

    updateAvatar = true;
    const level = await getRawLevel(user.id).catch(() => 0);
    if (
      level >= 300 &&
      (await isTracking(user.id)) &&
      !(await isEcoBanned(user.id)
        .then((r) => r.banned)
        .catch(() => false))
    ) {
      (async () => {
        const arrayBuffer = await fetch(newAvatar).then((r) => r.arrayBuffer());
        const ext = newAvatar.split(".").pop().split("?")[0];
        const key = `avatar/${user.id}/${nanoid()}.${ext}`;

        const res = await putObject(key, Buffer.from(arrayBuffer), `image/${ext}`);

        if (!res) return;

        await addNewAvatar(user.id, `${Constants.CDN_DOMAIN}/${key}`);
        logger.debug(`avatar-history: added avatar for ${user.id}`, { userId: user.id });
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
      usernameUpdatedAt: updateUsername ? date : undefined,
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

  if (guildId) {
    setLastCommand(guildId, date.getTime());
    debouncedGuildLastCommand(guildId, guildId);
  }
}
