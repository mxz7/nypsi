import { DMSettings, Preferences } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { InlineNotificationPayload, NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
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

export async function getDmSettings(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`)) {
    return (await JSON.parse(
      await redis.get(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`),
    )) as DMSettings;
  }

  let query = await prisma.dMSettings.findUnique({
    where: {
      userId: id,
    },
  });

  if (!query) {
    query = await prisma.dMSettings.create({
      data: {
        userId: id,
      },
    });
  }

  await redis.set(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`, ms("12 hour") / 1000);

  return query;
}

export async function updateDmSettings(member: GuildMember | string, data: DMSettings) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.dMSettings.update({
    where: {
      userId: id,
    },
    data,
  });

  await redis.del(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`);

  return query;
}

export function getNotificationsData() {
  return notificationsData;
}

export function getPreferencesData() {
  return preferencesData;
}

export async function getPreferences(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.PREFERENCES}:${id}`)) {
    return (await JSON.parse(
      await redis.get(`${Constants.redis.cache.user.PREFERENCES}:${id}`),
    )) as Preferences;
  }

  let query = await prisma.preferences.findUnique({
    where: {
      userId: id,
    },
  });

  if (!query) {
    query = await prisma.preferences.create({
      data: {
        userId: id,
      },
    });
  }

  await redis.set(`${Constants.redis.cache.user.PREFERENCES}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.user.PREFERENCES}:${id}`, ms("12 hour") / 1000);

  return query;
}

export async function updatePreferences(member: GuildMember | string, data: Preferences) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.preferences.update({
    where: {
      userId: id,
    },
    data,
  });

  await redis.del(`${Constants.redis.cache.user.PREFERENCES}:${id}`);

  return query;
}

export async function addNotificationToQueue(...payload: NotificationPayload[]) {
  await redis.lpush(Constants.redis.nypsi.DM_QUEUE, ...payload.map((p) => JSON.stringify(p)));
}

export async function addInlineNotification(...payload: InlineNotificationPayload[]) {
  for (const p of payload) {
    await redis.lpush(`${Constants.redis.nypsi.INLINE_QUEUE}:${p.memberId}`, JSON.stringify(p));
  }
}

// gets max of 9 and clears
export async function getInlineNotifications(userId: string) {
  const notifs = await redis.spop(`${Constants.redis.nypsi.INLINE_QUEUE}:${userId}`, 9);

  return notifs.map((i) => JSON.parse(i) as InlineNotificationPayload);
}
