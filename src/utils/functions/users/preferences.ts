import prisma from "../../../init/database";
import {
  DmPreferences,
  PreferenceData,
  PreferenceKey,
  Preferences,
  PreferenceValue,
  PreferenceValueForKey,
} from "../../../types/Preferences";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { createUser, userExists } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

declare function require(name: string): any;

const notificationPreferences: Record<string, PreferenceData> =
  require("../../../../data/preferences.json").notifications;
const generalPreferences: Record<string, PreferenceData> =
  require("../../../../data/preferences.json").general;
const preferenceData: Record<string, PreferenceData> = {
  ...Object.fromEntries(
    Object.entries(notificationPreferences).map(([key, value]) => [`dms.${key}`, value]),
  ),
  ...generalPreferences,
};
const preferencesCache = new RedisCache<Preferences>(
  Constants.redis.cache.user.PREFERENCES,
  ms("12 hours") / 1000,
);

function getDefaults(): Preferences {
  return {
    dms: Object.fromEntries(
      Object.entries(notificationPreferences).map(([key, preference]) => [key, preference.default]),
    ) as unknown as DmPreferences,
    ...Object.fromEntries(
      Object.entries(generalPreferences).map(([key, preference]) => [key, preference.default]),
    ),
  } as Preferences;
}

function hydratePreferences(rows: { key: string; value: unknown }[]): Preferences {
  const preferences = getDefaults();

  for (const row of rows) {
    const definition = preferenceData[row.key];

    if (
      definition &&
      typeof row.value === typeof definition.default &&
      (definition.types === undefined || definition.types.some((type) => type.value === row.value))
    ) {
      if (row.key.startsWith("dms.")) {
        const key = row.key.slice(4) as keyof DmPreferences;
        preferences.dms[key] = row.value as never;
      } else {
        (preferences as unknown as Record<string, PreferenceValue>)[row.key] =
          row.value as PreferenceValue;
      }
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
  const cached = await preferencesCache.get(userId);

  if (cached) return cached;

  const rows = await prisma.preferences.findMany({ where: { userId } });
  const preferences = hydratePreferences(rows);

  await preferencesCache.set(userId, preferences);

  return preferences;
}

export async function updatePreference<K extends PreferenceKey>(
  member: MemberResolvable,
  key: K,
  value: PreferenceValueForKey<K>,
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

  await preferencesCache.delete(userId);

  return getPreferences(userId);
}

export function getPreferenceData(category: "notifications" | "general") {
  return category === "notifications" ? notificationPreferences : generalPreferences;
}
