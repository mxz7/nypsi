import { DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import s3 from "../../../init/s3";
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
    await redis.set(`${Constants.redis.cache.user.TRACKING}:${id}`, "t", "EX", 86400);

    return true;
  } else {
    await redis.set(`${Constants.redis.cache.user.TRACKING}:${id}`, "f", "EX", 86400);

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
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

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
    },
  });
}

export async function fetchAvatarHistory(member: GuildMember | string, limit = 69) {
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
      createdAt: true,
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return query;
}

export async function deleteAvatar(id: number) {
  let res = true;
  const query = await prisma.username
    .delete({
      where: {
        id: id,
      },
      select: {
        value: true,
      },
    })
    .catch(() => {
      res = false;
    });

  if (query && query.value.startsWith("https://cdn.nypsi.xyz")) {
    const key = query.value.substring(22);

    s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  }

  return res;
}

export async function deleteAllAvatars(userId: string) {
  const avatars = await prisma.username.findMany({
    where: {
      AND: [{ type: "avatar" }, { userId }],
    },
    select: {
      value: true,
    },
  });

  const commands: { Key: string }[] = [];

  for (const { value } of avatars) {
    if (value.startsWith("https://cdn.nypsi.xyz")) {
      const key = value.substring(22);
      commands.push({ Key: key });
    }
  }

  if (commands.length > 0)
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: process.env.S3_BUCKET,
        Delete: { Objects: commands },
      }),
    );

  await prisma.username.deleteMany({
    where: {
      AND: [{ type: "avatar" }, { userId }],
    },
  });
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
