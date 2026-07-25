import { GuildMember } from "discord.js";
import { Tags } from "#generated/prisma";
import prisma from "../../../init/database";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getTagsData } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";
import PageManager from "../page";

const tagsCache = new RedisCache<Tags[]>(Constants.redis.cache.user.tags, 604800);
const tagCountCache = new RedisCache<number>(Constants.redis.cache.user.tagCount, 84000);

export async function getTags(member: MemberResolvable) {
  const userId = getUserId(member);

  const cached = await tagsCache.get(userId);
  if (cached) return cached;

  const query = await prisma.tags.findMany({
    where: { userId },
  });

  await tagsCache.set(userId, query);

  return query;
}

export async function removeTag(member: MemberResolvable, tagId: string) {
  const userId = getUserId(member);

  await tagsCache.delete(userId);

  await prisma.tags.delete({
    where: {
      userId_tagId: {
        userId,
        tagId,
      },
    },
  });

  return getTags(userId);
}

export async function addTag(member: MemberResolvable, tagId: string) {
  const userId = getUserId(member);

  const tags = getTagsData();

  if (!tags[tagId]) {
    logger.warn("attempted to add invalid tag", { userId, tagId });
    return getTags(userId);
  }

  await Promise.all([tagsCache.delete(userId), tagCountCache.delete(tagId)]);

  await prisma.tags.create({
    data: {
      userId,
      tagId,
    },
  });

  return getTags(userId);
}

export async function setActiveTag(member: MemberResolvable, tagId: string) {
  const userId = getUserId(member);

  await tagsCache.delete(userId);

  await prisma.tags.updateMany({
    where: { userId },
    data: {
      selected: false,
    },
  });

  if (tagId != "none")
    await prisma.tags.update({
      where: {
        userId_tagId: {
          userId,
          tagId,
        },
      },
      data: {
        selected: true,
      },
    });

  return getTags(userId);
}

export async function getActiveTag(member: MemberResolvable) {
  const tags = await getTags(member);

  return tags.find((i) => i.selected);
}

export async function getTagCount(tagId: string) {
  const cached = await tagCountCache.get(tagId);
  if (cached !== null) return cached;

  const query = await prisma.tags.count({ where: { tagId } });

  await tagCountCache.set(tagId, query);

  return query;
}

export async function showTags(target: GuildMember) {
  const tags = await getTags(target);
  const tagData = getTagsData();

  let pages: Map<number, string[]>;

  if (tags.find((i) => i.selected)) {
    pages = PageManager.createPages([
      `active: ${tagData[tags.find((i) => i.selected).tagId].emoji} \`${
        tagData[tags.find((i) => i.selected).tagId].name
      }\``,
      "",
      ...tags.map((i) => `${tagData[i.tagId].emoji} \`${tagData[i.tagId].name}\``),
    ]);
  } else {
    pages = PageManager.createPages(
      tags.map((i) => `${tagData[i.tagId].emoji} \`${tagData[i.tagId].name}\``),
    );
  }

  const embed = new CustomEmbed(
    target,
    pages.size ? pages.get(1).join("\n") : "no tags to display",
  ).setHeader(`${target.user.username}'s tags`, target.user.displayAvatarURL());

  return { pages, embed };
}
