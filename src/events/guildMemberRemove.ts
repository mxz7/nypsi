import { GuildMember, PartialGuildMember } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import Constants from "../utils/Constants";
import { getPersistentRoles } from "../utils/functions/guilds/roles";
import { clearMemberCache } from "../utils/functions/member";
import { isBooster, setBooster } from "../utils/functions/premium/boosters";
import { getTags, removeTag } from "../utils/functions/users/tags";
import { logger } from "../utils/logger";

export default async function guildMemberRemove(member: GuildMember | PartialGuildMember) {
  if (member.partial) {
    const fetched: false | GuildMember = await member.fetch().catch(() => false);

    if (!fetched) {
      logger.error("guild member remove: failed to fetch partial member");
      return;
    }

    member = fetched;
  }

  clearMemberCache(member.guild.id);
  await redis.del(`${Constants.redis.cache.guild.JOIN_ORDER}:${member.guild.id}`);

  if (member.roles.cache.size > 0 && (await getPersistentRoles(member.guild)).length > 0) {
    await prisma.rolePersist.upsert({
      where: {
        guildId_userId: {
          guildId: member.guild.id,
          userId: member.id,
        },
      },
      create: {
        userId: member.id,
        guildId: member.guild.id,
        roles: Array.from(member.roles.cache.values()).map((r) => r.id),
      },
      update: {
        roles: Array.from(member.roles.cache.values()).map((r) => r.id),
      },
    });
  }

  if (member.guild.id != Constants.NYPSI_SERVER_ID) return;

  if (await isBooster(member.user.id)) await setBooster(member.user.id, false);

  const tags = await getTags(member.user.id);

  for (const tag of tags) {
    if (tag.tagId.includes("year")) {
      await removeTag(tag.userId, tag.tagId);
    }
  }
}
