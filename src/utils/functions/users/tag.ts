import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import ms = require("ms");

export const lastKnownTagCooldown = new Set<string>();

export async function updateLastKnowntag(member: GuildMember | string, tag: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (lastKnownTagCooldown.has(id)) {
    return;
  } else {
    lastKnownTagCooldown.add(id);
    setTimeout(() => {
      lastKnownTagCooldown.delete(id);
    }, ms("1 hour"));
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
