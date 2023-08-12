import { GuildMember } from "discord.js";
import prisma from "../../../init/database";

export async function updateLastKnownUsername(member: GuildMember | string, tag: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      lastKnownUsername: tag,
    },
  });
}

export async function getLastKnownUsername(id: string) {
  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      lastKnownUsername: true,
    },
  });

  return query.lastKnownUsername;
}

export async function getIdFromUsername(username: string) {
  const query = await prisma.user.findFirst({
    where: { lastKnownUsername: username },
    select: {
      id: true,
    },
  });

  return query?.id;
}

export async function getLastKnownAvatar(id: string) {
  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      avatar: true,
    },
  });

  return query.avatar;
}
