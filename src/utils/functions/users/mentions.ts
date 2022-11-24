import { Collection, Guild, GuildMember, Message, ThreadMember } from "discord.js";
import prisma from "../../../init/database";

export interface MentionQueueItem {
  type: string;
  members?: Collection<string, GuildMember | ThreadMember>;
  channelMembers?: any;
  message?: Message;
  guildId: string;
  url?: string;
  target?: string;
  data?: MentionData;
}

interface MentionData {
  user: string;
  content: string;
  date: number;
  link: string;
}

const mentionQueue: MentionQueueItem[] = [];

export { mentionQueue };

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
