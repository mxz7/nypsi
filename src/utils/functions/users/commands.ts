import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export async function updateLastCommand(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const date = new Date();

  await redis.set(`${Constants.redis.cache.user.LAST_COMMAND}:${id}`, date.getTime());

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      lastCommand: date,
    },
  });
}

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

  return query.lastCommand;
}

export async function addCommandUse(id: string, command: string) {
  await prisma.commandUse.upsert({
    where: {
      userId_command: {
        userId: id,
        command: command,
      },
    },
    update: {
      uses: { increment: 1 },
    },
    create: {
      command: command,
      userId: id,
    },
  });
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
