import { GuildMember } from "discord.js";
import prisma from "../../../init/database";

export async function updateLastKnowntag(member: GuildMember | string, tag: string) {
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
      lastKnownTag: tag,
    },
  });
}

export async function getLastKnownTag(id: string) {
  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      lastKnownTag: true,
    },
  });

  return query.lastKnownTag;
}
