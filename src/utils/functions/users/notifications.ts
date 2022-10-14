import { DMSettings } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
import ms = require("ms");

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
