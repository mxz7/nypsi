import { DMSettings } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NotificationPayload } from "../../../types/Notification";
import ms = require("ms");
import Constants from "../../Constants";

declare function require(name: string): any;

interface NotificationData {
  id: string;
  name: string;
  description: string;
  types?: { name: string; description: string; value: string }[];
}

const notificationsData: { [key: string]: NotificationData } = require("../../../../data/notifications.json");

export async function getDmSettings(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`)) {
    return (await JSON.parse(await redis.get(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`))) as DMSettings;
  }

  let query = await prisma.dMSettings
    .findUnique({
      where: {
        userId: id,
      },
    })
    .catch(() => {});

  if (!query) {
    query = await prisma.dMSettings.create({
      data: {
        userId: id,
      },
    });
  }

  await redis.set(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.user.DM_SETTINGS}:${id}`, ms("1 hour") / 1000);

  return query;
}

export async function updateDmSettings(member: GuildMember, data: DMSettings) {
  const query = await prisma.dMSettings.update({
    where: {
      userId: member.user.id,
    },
    data,
  });

  await redis.del(`${Constants.redis.cache.user.DM_SETTINGS}:${member.user.id}`);

  return query;
}

export function getNotificationsData() {
  return notificationsData;
}

export async function addNotificationToQueue(payload: NotificationPayload) {
  await redis.lpush(Constants.redis.nypsi.DM_QUEUE, JSON.stringify(payload));
}
