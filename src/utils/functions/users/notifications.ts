import { DMSettings, Preferences } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { InlineNotificationPayload, NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { dmQueue } from "../../queues/queues";
import { createUser, userExists } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

declare function require(name: string): any;

interface NotificationData {
  id: string;
  name: string;
  description: string;
  types?: { name: string; description: string; value: string }[];
}

const notificationsData: { [key: string]: NotificationData } =
  require("../../../../data/notifications.json").notifications;
const preferencesData: { [key: string]: NotificationData } =
  require("../../../../data/notifications.json").preferences;

export async function getDmSettings(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.user.DM_SETTINGS}:${userId}`)) {
    return (await JSON.parse(
      await redis.get(`${Constants.redis.cache.user.DM_SETTINGS}:${userId}`),
    )) as DMSettings;
  }

  let query = await prisma.dMSettings.findUnique({
    where: {
      userId,
    },
  });

  if (!query) {
    query = await prisma.dMSettings.create({
      data: {
        userId,
      },
    });
  }

  await redis.set(
    `${Constants.redis.cache.user.DM_SETTINGS}:${userId}`,
    JSON.stringify(query),
    "EX",
    ms("12 hour") / 1000,
  );

  return query;
}

export async function updateDmSettings(member: MemberResolvable, data: DMSettings) {
  const userId = getUserId(member);

  const query = await prisma.dMSettings.update({
    where: {
      userId,
    },
    data,
  });

  await redis.del(`${Constants.redis.cache.user.DM_SETTINGS}:${userId}`);

  return query;
}

export function getNotificationsData() {
  return notificationsData;
}

export function getPreferencesData() {
  return preferencesData;
}

export async function getPreferences(member: MemberResolvable): Promise<Preferences> {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.user.PREFERENCES}:${userId}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.user.PREFERENCES}:${userId}`),
      // json cant parse bigints on its own so we have to do it manually
      (key, value) => {
        return key !== "userId" && typeof value === "string" && !isNaN(Number(value))
          ? BigInt(value)
          : value;
      },
    ) as Preferences;
  }

  let query = await prisma.preferences.findUnique({
    where: {
      userId: userId,
    },
  });

  if (!query) {
    if (!(await userExists(userId))) await createUser(userId);

    query = await prisma.preferences.create({
      data: {
        userId: userId,
      },
    });
  }

  await redis.set(
    `${Constants.redis.cache.user.PREFERENCES}:${userId}`,
    JSON.stringify(query, (key, value) => (typeof value === "bigint" ? Number(value) : value)),
    "EX",
    ms("12 hour") / 1000,
  );

  return query;
}

export async function updatePreferences(member: MemberResolvable, data: Preferences) {
  const userId = getUserId(member);

  const query = await prisma.preferences.update({
    where: {
      userId,
    },
    data,
  });

  await redis.del(`${Constants.redis.cache.user.PREFERENCES}:${userId}`);

  return query;
}

export function addNotificationToQueue(...payload: NotificationPayload[]) {
  return dmQueue.addBulk(
    payload.map((data) => ({
      data,
      name: data.memberId,
    })),
  );
}

export async function addInlineNotification(...payload: InlineNotificationPayload[]) {
  for (const p of payload) {
    await redis.sadd(`${Constants.redis.nypsi.INLINE_QUEUE}:${p.memberId}`, JSON.stringify(p));
  }
}

// gets max of 8 and clears
export async function getInlineNotifications(member: MemberResolvable) {
  const notifs = await redis.spop(`${Constants.redis.nypsi.INLINE_QUEUE}:${getUserId(member)}`, 8);

  return notifs.map((i) => JSON.parse(i) as InlineNotificationPayload);
}
