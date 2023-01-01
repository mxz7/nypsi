import { GuildMember, User } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

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

export async function getCommandUses(member: GuildMember) {
  const query = await prisma.commandUse.findMany({
    where: {
      userId: member.user.id,
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

  await redis.set(`${Constants.redis.cache.user.LAST_COMMAND}:${user.id}`, date.getTime());
  await redis.expire(`${Constants.redis.cache.user.LAST_COMMAND}:${user.id}`, ms("30 minutes") / 1000);

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastCommand: date,
      lastKnownTag: user.tag,
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
