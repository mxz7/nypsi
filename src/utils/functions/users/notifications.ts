import { DMSettings, Preferences } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import {
  InlineNotificationPayload,
  NotificationData,
  NotificationPayload,
} from "../../../types/Notification";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { dmQueue } from "../../queues/queues";
import { createUser, userExists } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

declare function require(name: string): any;

const notificationsData: { [key: string]: NotificationData } =
  require("../../../../data/notifications.json").notifications;
const preferencesData: { [key: string]: NotificationData } =
  require("../../../../data/notifications.json").preferences;
const dmSettingsCache = new RedisCache<DMSettings>(
  Constants.redis.cache.user.DM_SETTINGS,
  ms("12 hour") / 1000,
);
const preferencesCache = new RedisCache<Preferences>(
  Constants.redis.cache.user.PREFERENCES,
  ms("12 hour") / 1000,
);

export async function getDmSettings(member: MemberResolvable) {
  const userId = getUserId(member);

  const cached = await dmSettingsCache.get(userId);
  if (cached) return cached;

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

  await dmSettingsCache.set(userId, query);

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

  await dmSettingsCache.delete(userId);

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

  const cached = await preferencesCache.get(userId);
  if (cached) return cached;

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

  await preferencesCache.set(userId, query);

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

  await preferencesCache.delete(userId);

  return query;
}

export function addNotificationToQueue(...payload: NotificationPayload[]) {
  return dmQueue.addBulk(
    payload.map((data) => ({
      name: data.memberId,
      data: {
        memberId: data.memberId,
        payload: {
          content: data.payload.content,
          embeds: data.payload.embed ? [data.payload.embed.toJSON()] : undefined,
          components: data.payload.components ? [data.payload.components.toJSON()] : undefined,
        },
      },
      opts: { attempts: 5, backoff: { type: "exponential", delay: 300000 } },
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
