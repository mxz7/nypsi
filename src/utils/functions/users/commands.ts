import { GuildMember, User } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { logger } from "../../logger";
import ms = require("ms");

export const recentCommands = new Map<string, number>();

setInterval(() => {
  logger.debug(`recent commands size: ${recentCommands.size}`);
}, ms("1 hour"));

export async function getLastCommand(member: GuildMember | string): Promise<Date> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.LAST_COMMAND}:${id}`))
    return new Date(parseInt(await redis.get(`${Constants.redis.cache.user.LAST_COMMAND}:${id}`)));

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      lastCommand: true,
    },
  });

  if (!query || !query.lastCommand) {
    return new Date(0);
  }

  await redis.set(`${Constants.redis.cache.user.LAST_COMMAND}:${id}`, query.lastCommand.getTime());
  await redis.expire(`${Constants.redis.cache.user.LAST_COMMAND}:${id}`, ms("30 minutes") / 1000);

  return query.lastCommand;
}

export async function getCommandUses(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.commandUse.findMany({
    where: {
      userId: id,
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

  await redis.set(`${Constants.redis.cache.user.LAST_COMMAND}:${user.id}`, date.getTime());
  await redis.expire(
    `${Constants.redis.cache.user.LAST_COMMAND}:${user.id}`,
    ms("30 minutes") / 1000,
  );
  await redis.set(`${Constants.redis.cache.user.username}:${user.id}`, user.tag || "", "EX", 7200);

  await prisma.user.update({
    select: {
      id: true,
    },
    where: {
      id: user.id,
    },
    data: {
      lastCommand: date,
      lastKnownUsername: user.username,
      avatar: user.displayAvatarURL({ size: 256 }).endsWith("webp")
        ? user.displayAvatarURL({ extension: "gif", size: 256 })
        : user.displayAvatarURL({ extension: "png", size: 256 }),
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
