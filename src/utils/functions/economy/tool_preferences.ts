import { ToolPreferences, ToolPreferenceSelection } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

export async function getToolPreferences(member: MemberResolvable): Promise<ToolPreferences> {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.TOOL_PREFERENCES}:${userId}`);

  if (cache) {
    return JSON.parse(cache);
  }

  const query = await prisma.toolPreferences.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  await redis.set(
    `${Constants.redis.cache.economy.TOOL_PREFERENCES}:${userId}`,
    JSON.stringify(query),
    "EX",
    Math.floor(ms("6 hours") / 1000),
  );

  return query;
}

export async function toggleToolPreference(
  member: MemberResolvable,
  toggle: "unbreaking" | "lower",
  value: boolean,
) {
  const userId = getUserId(member);

  const type = toggle == "unbreaking" ? "bestToolOnUnbreaking" : "useLowerToolOnEmpty";

  await prisma.toolPreferences.update({
    where: {
      userId,
    },
    data: {
      [type]: value,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.TOOL_PREFERENCES}:${userId}`);
}

export async function setToolPreference(
  member: MemberResolvable,
  tool: "gun" | "rod" | "pickaxe",
  preference: ToolPreferenceSelection,
): Promise<void> {
  const userId = getUserId(member);

  const type = tool == "gun" ? "gunType" : tool == "rod" ? "rodType" : "pickaxeType";

  await prisma.toolPreferences.update({
    where: { userId },
    data: {
      [type]: preference,
    },
  });

  await redis.del(`${Constants.redis.cache.economy.TOOL_PREFERENCES}:${userId}`);
}
