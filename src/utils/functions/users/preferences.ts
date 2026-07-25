import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { PreferenceData, Preferences, PreferenceValue } from "../../../types/Preferences";
import Constants from "../../Constants";
import { createUser, userExists } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

declare function require(name: string): any;

const notificationPreferences: Record<string, PreferenceData> =
  require("../../../../data/preferences.json").notifications;
const generalPreferences: Record<string, PreferenceData> =
  require("../../../../data/preferences.json").general;
const preferenceData = { ...notificationPreferences, ...generalPreferences };

function getDefaults(): Preferences {
  return Object.fromEntries(
    Object.entries(preferenceData).map(([key, preference]) => [key, preference.default]),
  ) as unknown as Preferences;
}

function hydratePreferences(rows: { key: string; value: unknown }[]): Preferences {
  const preferences = getDefaults() as unknown as Record<string, PreferenceValue>;

  for (const row of rows) {
    const definition = preferenceData[row.key];

    if (
      definition &&
      typeof row.value === typeof definition.default &&
      (definition.types === undefined || definition.types.some((type) => type.value === row.value))
    ) {
      preferences[row.key] = row.value as PreferenceValue;
    }
  }

  return preferences as unknown as Preferences;
}

function validatePreferenceValue(data: PreferenceData, value: PreferenceValue) {
  return (
    typeof value === typeof data.default &&
    (data.types === undefined || data.types.some((type) => type.value === value))
  );
}

export async function getPreferences(member: MemberResolvable): Promise<Preferences> {
  const userId = getUserId(member);
  const cacheKey = `${Constants.redis.cache.user.PREFERENCES}:${userId}`;

  if (await redis.exists(cacheKey)) {
    return JSON.parse(await redis.get(cacheKey)) as Preferences;
  }

  const rows = await prisma.preferences.findMany({ where: { userId } });
  const preferences = hydratePreferences(rows);

  await redis.set(cacheKey, JSON.stringify(preferences), "EX", ms("12 hour") / 1000);

  return preferences;
}

export async function updatePreference<K extends keyof Preferences>(
  member: MemberResolvable,
  key: K,
  value: Preferences[K],
) {
  const userId = getUserId(member);
  const definition = preferenceData[key];

  if (!definition || !validatePreferenceValue(definition, value)) {
    throw new Error(`invalid preference value for ${key}`);
  }

  if (!(await userExists(userId))) await createUser(userId);

  if (value === definition.default) {
    await prisma.preferences.delete({ where: { userId_key: { userId, key: key as string } } });
  } else {
    await prisma.preferences.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value },
      update: { value },
    });
  }

  await redis.del(`${Constants.redis.cache.user.PREFERENCES}:${userId}`);

  return getPreferences(userId);
}

export function getPreferenceData(category: "notifications" | "general") {
  return category === "notifications" ? notificationPreferences : generalPreferences;
}
