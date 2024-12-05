import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Image, ImageSuggestion } from "@prisma/client";
import { parse } from "@twemoji/parser";
import { User } from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import s3 from "../../init/s3";
import Constants from "../Constants";
import { logger } from "../logger";
import { addProgress } from "./economy/achievements";
import { userExists } from "./economy/utils";
import { addNotificationToQueue } from "./users/notifications";

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);
}

export async function getRandomImage(type: string) {
  const cache = await redis.get(`${Constants.redis.cache.IMAGE}:${type}`);

  let images: Image[];

  if (cache) {
    images = JSON.parse(cache) as Image[];
  } else {
    if (type !== "wholesome") {
      images = await fetch(`https://animals.maxz.dev/api/${type}/all`).then((r) =>
        r.json().then((i) => i.map((i: any) => ({ id: i.id, url: i.image, name: i.name }))),
      );

      await redis.set(
        `${Constants.redis.cache.IMAGE}:${type}`,
        JSON.stringify(images),
        "EX",
        86400,
      );
    } else {
      images = await prisma.image.findMany({
        where: {
          type,
        },
      });

      await redis.set(
        `${Constants.redis.cache.IMAGE}:${type}`,
        JSON.stringify(images),
        "EX",
        86400,
      );
    }
  }

  const chosen = images[Math.floor(Math.random() * images.length)];

  // doesnt work if not awaited !?!?!??!!?
  await prisma.image
    .update({
      where: { id: chosen.id },
      data: { views: { increment: 1 } },
    })
    .catch(() => null);

  return chosen;
}

export async function getImageSuggestion() {
  return await prisma.imageSuggestion.findFirst();
}

export async function reviewImageSuggestion(
  image: ImageSuggestion,
  result: "accept" | "deny",
  mod: User,
) {
  const found = await prisma.imageSuggestion
    .delete({
      where: {
        id: image.id,
      },
    })
    .catch(() => null);

  if (!found) return;

  if (result === "accept") {
    const { id } = await prisma.image.create({
      data: {
        type: image.type,
        accepterId: mod.id,
        uploaderId: image.uploaderId,
        url: image.url,
      },
      select: {
        id: true,
      },
    });

    await redis.del(`${Constants.redis.cache.IMAGE}:${image.type}`);

    logger.info(
      `admin: ${mod.id} (${mod.username}) accepted suggestion by ${image.uploaderId} id: ${id}`,
    );

    if (image.uploaderId !== Constants.BOT_USER_ID)
      addNotificationToQueue({
        memberId: image.uploaderId,
        payload: { content: `your image (${image.url}) has been accepted` },
      });
    if (await userExists(image.uploaderId)) addProgress(image.uploaderId, "wholesome", 1);
  } else {
    logger.info(`admin: ${mod.id} (${mod.username}) denied suggestion by ${image.uploaderId}`);
  }
}

export function getEmojiImage(emoji: string) {
  let image: string;

  if (emoji.split(":")[2]) {
    const emojiID = emoji.split(":")[2].slice(0, emoji.split(":")[2].length - 1);

    image = `https://cdn.discordapp.com/emojis/${emojiID}`;

    if (emoji.split(":")[0].includes("a")) {
      image = image + ".gif";
    } else {
      image = image + ".png";
    }
  } else {
    try {
      image = parse(emoji, { assetType: "png" })[0].url;
    } catch {
      /* happy linter */
    }
  }

  return image;
}

export async function imageExists(id: string) {
  if (await redis.exists(`${Constants.redis.cache.IMAGE}:${id}`)) return true;
  const query = await prisma.images.findUnique({ where: { id } });

  const exists = Boolean(query);

  if (exists) await redis.set(`${Constants.redis.cache.IMAGE}:${id}`, "y", "EX", 86400);

  return exists;
}

export async function uploadImage(id: string, buffer: Buffer, ContentType: string) {
  await Promise.all([
    s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: id,
        Body: buffer,
        ContentType: ContentType,
      }),
    ),
    prisma.images.create({ data: { id, bytes: buffer.byteLength } }),
  ]);

  await redis.set(`${Constants.redis.cache.IMAGE}:${id}`, "y", "EX", 86400);

  return true;
}

export async function deleteImage(id: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: id }));
  await prisma.images.delete({ where: { id } });
  await redis.del(`${Constants.redis.cache.IMAGE}:${id}`);
}
