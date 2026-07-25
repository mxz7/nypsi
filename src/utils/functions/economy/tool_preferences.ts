import { ToolPreferenceSelection } from "#generated/prisma";
import prisma from "../../../init/database";
import { ToolPreferences } from "../../../types/Economy";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
const toolPreferencesCache = new RedisCache<ToolPreferences>(
  Constants.redis.cache.economy.TOOL_PREFERENCES,
  6 * 60 * 60,
);

export async function getToolPreferences(member: MemberResolvable): Promise<ToolPreferences> {
  const userId = getUserId(member);

  const cache = await toolPreferencesCache.get(userId);

  if (cache) return cache;

  const query = await prisma.economy.findUnique({
    where: { userId },
    select: {
      preferredGun: true,
      preferredPickaxe: true,
      preferredRod: true,
      useBestToolOnUnbreaking: true,
      useLowerToolOnEmpty: true,
    },
  });

  await toolPreferencesCache.set(userId, query);

  return query;
}

export async function toggleToolPreference(
  member: MemberResolvable,
  toggle: "unbreaking" | "lower",
  value: boolean,
) {
  const userId = getUserId(member);

  const type = toggle == "unbreaking" ? "useBestToolOnUnbreaking" : "useLowerToolOnEmpty";

  await prisma.economy.update({
    where: {
      userId,
    },
    data: {
      [type]: value,
    },
  });

  await toolPreferencesCache.delete(userId);
}

export async function setToolPreference(
  member: MemberResolvable,
  tool: "gun" | "rod" | "pickaxe",
  preference: ToolPreferenceSelection,
): Promise<void> {
  const userId = getUserId(member);

  const type = tool == "gun" ? "preferredGun" : tool == "rod" ? "preferredRod" : "preferredPickaxe";

  await prisma.economy.update({
    where: { userId },
    data: {
      [type]: preference,
    },
  });

  await toolPreferencesCache.delete(userId);
}
