import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import prisma from "../../../init/database";
import s3 from "../../../init/s3";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { deleteObject } from "../s3";
import { hasProfile } from "./utils";

const trackingCache = new RedisCache<boolean>(Constants.redis.cache.user.TRACKING, 86400);

export async function isTracking(member: MemberResolvable): Promise<boolean> {
  const userId = getUserId(member);

  const cached = await trackingCache.get(userId);
  if (cached !== null) return cached;

  if (!(await hasProfile(userId))) return false;

  const query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      tracking: true,
    },
  });

  await trackingCache.set(userId, query.tracking);
  return query.tracking;
}

export async function disableTracking(member: MemberResolvable) {
  const userId = getUserId(member);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      tracking: false,
    },
  });

  await trackingCache.delete(userId);
}

export async function enableTracking(member: MemberResolvable) {
  const userId = getUserId(member);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      tracking: true,
    },
  });

  await trackingCache.delete(userId);
}

export async function addNewUsername(member: MemberResolvable, username: string) {
  await prisma.username.create({
    data: {
      userId: getUserId(member),
      value: username,
    },
  });
}

export async function fetchUsernameHistory(member: MemberResolvable, limit = 69) {
  const query = await prisma.username.findMany({
    where: {
      AND: [{ userId: getUserId(member) }, { type: "username" }],
    },
    select: {
      value: true,
      createdAt: true,
    },
    orderBy: {
      id: "desc",
    },
    take: limit,
  });

  return query;
}

export async function clearUsernameHistory(member: MemberResolvable) {
  await prisma.username.deleteMany({
    where: {
      AND: [{ userId: getUserId(member) }, { type: "username" }],
    },
  });
}

export async function addNewAvatar(member: MemberResolvable, url: string) {
  await prisma.username.create({
    data: {
      userId: getUserId(member),
      type: "avatar",
      value: url,
    },
  });
}

export async function fetchAvatarHistory(member: MemberResolvable, limit = 69) {
  const query = await prisma.username.findMany({
    where: {
      AND: [{ userId: getUserId(member) }, { type: "avatar" }],
    },
    select: {
      value: true,
      createdAt: true,
      id: true,
    },
    orderBy: {
      id: "desc",
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

  if (query && query.value.startsWith("${Constants.CDN_DOMAIN}")) {
    const key = query.value.substring(22);

    await deleteObject(key);
  }

  return res;
}

export async function deleteAllAvatars(member: MemberResolvable) {
  const userId = getUserId(member);

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
    if (value.startsWith("${Constants.CDN_DOMAIN}")) {
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

export async function clearAvatarHistory(member: MemberResolvable) {
  const avatars = await prisma.username.findMany({
    where: {
      AND: [{ userId: getUserId(member) }, { type: "avatar" }],
    },
    select: {
      id: true,
      value: true,
    },
  });

  for (const avatar of avatars) {
    const key = avatar.value.substring(22);
    await deleteObject(key);
    await prisma.username.delete({ where: { id: avatar.id } });
  }
}
