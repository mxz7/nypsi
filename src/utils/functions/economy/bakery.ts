import { GuildMember } from "discord.js";
import prisma from "../../../init/database";

export async function getLastBake(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: id,
    },
    select: {
      lastBake: true,
    },
  });

  return query.lastBake;
}
