import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { hasProfile } from "./utils";
import ms = require("ms");

export async function isTracking(member: GuildMember | string): Promise<boolean> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.TRACKING}:${id}`)) {
    return (await redis.get(`${Constants.redis.cache.user.TRACKING}:${id}`)) == "t" ? true : false;
  }

  if (!(await hasProfile(id))) return false;

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      tracking: true,
    },
  });

  if (query.tracking) {
    await redis.set(`${Constants.redis.cache.user.TRACKING}:${id}`, "t");
    await redis.expire(`${Constants.redis.cache.user.TRACKING}:${id}`, ms("12 hour") / 1000);
    return true;
  } else {
    await redis.set(`${Constants.redis.cache.user.TRACKING}:${id}`, "f");
    await redis.expire(`${Constants.redis.cache.user.TRACKING}:${id}`, ms("12 hour") / 1000);
    return false;
  }
}

export async function disableTracking(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      tracking: false,
    },
  });

  await redis.del(`${Constants.redis.cache.user.TRACKING}:${id}`);
}

export async function enableTracking(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      tracking: true,
    },
  });

  await redis.del(`${Constants.redis.cache.user.TRACKING}:${id}`);
}

export async function addNewUsername(member: GuildMember | string, username: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.username.create({
    data: {
      userId: id,
      value: username,
      date: new Date(),
    },
  });
}

export async function fetchUsernameHistory(member: GuildMember | string, limit = 69) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.username.findMany({
    where: {
      AND: [{ userId: id }, { type: "username" }],
    },
    select: {
      value: true,
      date: true,
    },
    orderBy: {
      date: "desc",
    },
    take: limit,
  });

  inPlaceSort(query).desc((u) => u.date);

  return query;
}

export async function clearUsernameHistory(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.username.deleteMany({
    where: {
      AND: [{ userId: id }, { type: "username" }],
    },
  });
}

export async function addNewAvatar(member: GuildMember | string, url: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.username.create({
    data: {
      userId: id,
      type: "avatar",
      value: url,
      date: new Date(),
    },
  });
}

export async function fetchAvatarHistory(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.username.findMany({
    where: {
      AND: [{ userId: id }, { type: "avatar" }],
    },
    select: {
      value: true,
      date: true,
      id: true,
    },
    orderBy: {
      date: "desc",
    },
  });

  inPlaceSort(query).desc((u) => u.date);

  return query;
}

export async function deleteAvatar(id: number) {
  let res = true;
  await prisma.username
    .delete({
      where: {
        id: id,
      },
    })
    .catch(() => {
      res = false;
    });
  return res;
}

export async function clearAvatarHistory(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.username.deleteMany({
    where: {
      AND: [{ userId: id }, { type: "avatar" }],
    },
  });
}
