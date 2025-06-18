import { GuildMember } from "discord.js";
import { Marriage } from "@prisma/client";
import prisma from "../../../init/database";

export async function isMarried(member: GuildMember | string): Promise<false | Marriage> {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  const res = await prisma.marriage.findFirst({
    where: {
      userId,
    },
  });

  if (res && !(await prisma.user.findFirst({ where: { id: res.partnerId } }))) {
    await removeMarriage(member);
    return false;
  }

  return res || false;
}

export async function addMarriage(userId: string, targetId: string) {
  await prisma.marriage.create({ data: { userId: userId, partnerId: targetId } });
  await prisma.marriage.create({ data: { userId: targetId, partnerId: userId } });
}

export async function removeMarriage(member: GuildMember | string) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  await prisma.marriage.deleteMany({
    where: {
      OR: [{ userId }, { partnerId: userId }],
    },
  });
}
