import { Guild, GuildMember } from "discord.js";
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

export async function fetchUserMentions(guild: Guild, member: GuildMember | string, amount = 100) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const mentions = await prisma.mention.findMany({
    where: {
      AND: [{ guildId: guild.id }, { targetId: id }],
    },
    orderBy: {
      date: "desc",
    },
    take: amount,
  });

  return mentions;
}

export async function deleteUserMentions(guild: Guild, member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.mention.deleteMany({
    where: {
      AND: [{ guildId: guild.id }, { targetId: id }],
    },
  });
}
