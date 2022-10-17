import { DMSettings } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NotificationPayload } from "../../../types/Notification";
import ms = require("ms");

declare function require(name: string): any;

interface NotificationData {
  id: string;
  name: string;
  description: string;
}

const notificationsData: { [key: string]: NotificationData } = require("../../../../data/notifications.json");

export async function getDmSettings(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:dmsettings:${id}`)) {
    return (await JSON.parse(await redis.get(`cache:dmsettings:${id}`))) as DMSettings;
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

  await redis.set(`cache:dmsettings:${id}`, JSON.stringify(query));
  await redis.expire(`cache:dmsettings:${id}`, ms("1 hour") / 1000);

  return query;
}

export async function updateDmSettings(member: GuildMember, data: DMSettings) {
  const query = await prisma.dMSettings.update({
    where: {
      userId: member.user.id,
    },
    data,
  });

  await redis.del(`cache:dmsettings:${member.user.id}`);

  return query;
}

export function getNotificationsData() {
  return notificationsData;
}

export async function addNotificationToQueue(payload: NotificationPayload) {
  await redis.lpush("nypsi:dm:queue", JSON.stringify(payload));
}
