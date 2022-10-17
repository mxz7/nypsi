import { GuildMember } from "discord.js";
import prisma from "../../../init/database";

export async function setLastWeekly(member: GuildMember | string, date: Date) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      lastWeekly: date,
    },
  });
}

export async function getLastWeekly(member: string) {
  const query = await prisma.premium.findUnique({
    where: {
      userId: member,
    },
    select: {
      lastWeekly: true,
    },
  });

  return query.lastWeekly;
}
