import { GuildMember } from "discord.js";
import prisma from "../../database/database";

const colorCache = new Map<string, `#${string}` | "default">();

export { colorCache };

export async function setEmbedColor(member: GuildMember | string, color: string) {
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
      embedColor: color,
    },
  });

  if (colorCache.has(id)) {
    colorCache.delete(id);
  }
}

export async function getEmbedColor(member: string): Promise<`#${string}` | "default"> {
  if (colorCache.has(member)) {
    return colorCache.get(member);
  }

  const query = await prisma.premium.findUnique({
    where: {
      userId: member,
    },
    select: {
      embedColor: true,
    },
  });

  colorCache.set(member, query.embedColor as `#${string}` | "default");

  return query.embedColor as `#${string}` | "default";
}
