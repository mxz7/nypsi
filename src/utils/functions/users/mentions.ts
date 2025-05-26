import { Mention } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";

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
  member: GuildMember | string,
  global: true | string,
  amount = 100,
) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  let mentions: Mention[];

  if (typeof global === "boolean" && global) {
    mentions = await prisma.mention.findMany({
      where: {
        targetId: id,
      },
      orderBy: {
        date: "desc",
      },
      take: amount,
    });
  } else if (typeof global === "string") {
    mentions = await prisma.mention.findMany({
      where: {
        AND: [{ guildId: global }, { targetId: id }],
      },
      orderBy: {
        date: "desc",
      },
      take: amount,
    });
  }

  return mentions;
}

export async function deleteUserMentions(userId: string, guildId?: string) {
  await prisma.mention.deleteMany({
    where: {
      AND: [{ guildId: guildId }, { targetId: userId }],
    },
  });
}
