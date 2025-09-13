import { Mention } from "@generated/prisma";
import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";

export interface MentionQueueItem {
  members: string[];
  channelMembers: string[];
  content: string;
  url: string;
  username: string;
  date: number;
  guildId: string;
}

export async function fetchUserMentions(
  member: MemberResolvable,
  global: true | string,
  amount = 100,
) {
  const userId = getUserId(member);

  let mentions: Mention[];

  if (typeof global === "boolean" && global) {
    mentions = await prisma.mention.findMany({
      where: {
        targetId: userId,
      },
      orderBy: {
        id: "desc",
      },
      take: amount,
    });
  } else if (typeof global === "string") {
    mentions = await prisma.mention.findMany({
      where: {
        AND: [{ guildId: global }, { targetId: userId }],
      },
      orderBy: {
        id: "desc",
      },
      take: amount,
    });
  }

  return mentions;
}

export async function deleteUserMentions(member: MemberResolvable, guildId?: string) {
  await prisma.mention.deleteMany({
    where: {
      AND: [{ guildId: guildId }, { targetId: getUserId(member) }],
    },
  });
}
