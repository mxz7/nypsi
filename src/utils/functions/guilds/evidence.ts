import { DeleteObjectCommand, DeleteObjectsCommand, PutObjectCommand, PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { Guild } from "discord.js";
import { nanoid } from "nanoid";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import s3 from "../../../init/s3";
import Constants from "../../Constants";
import { logger } from "../../logger";
import sharp = require("sharp");

export async function getMaxEvidenceBytes(guild: Guild) {
  const cache = await redis.get(`${Constants.redis.cache.guild.EVIDENCE_MAX}:${guild.id}`);

  if (cache) {
    return parseInt(cache);
  }

  const query = await prisma.guildEvidenceCredit.findMany({
    where: {
      guildId: guild.id,
    },
    select: {
      bytes: true,
    },
  });

  const base = Constants.EVIDENCE_BASE;
  let total = base;

  if (query.length > 0) total += Number(query.map((a) => a.bytes).reduce((a, b) => a + b));

  await redis.set(`${Constants.redis.cache.guild.EVIDENCE_MAX}:${guild.id}`, total, "EX", 21600); // 6 hours

  return total;
}

export async function getUsedEvidenceBytes(guild: Guild) {
  const evidences = await prisma.moderationEvidence.findMany({
    where: {
      guildId: guild.id,
    },
    select: {
      bytes: true,
    },
  });

  if (evidences.length === 0) return 0;
  else return Number(evidences.map((e) => e.bytes).reduce((a, b) => a + b));
}

export async function deleteEvidence(guild: Guild, caseId: number) {
  const evidence = await prisma.moderationEvidence.delete({
    where: {
      caseId_guildId: {
        caseId,
        guildId: guild.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (evidence)
    s3.send(
      new DeleteObjectCommand({
        Key: `evidence/${guild.id}/${evidence.id}`,
        Bucket: process.env.S3_BUCKET,
      }),
    ).catch((err) => {
      console.error(err);
      logger.error(`failed to delete evidence for case ${caseId} in ${guild.id}`, {err});
    });
}

export async function deleteAllEvidence(guild: Guild) {
  const evidence = await prisma.moderationEvidence.findMany({
    where: { guildId: guild.id },
    select: { id: true },
  });

  const cmd = new DeleteObjectsCommand({
    Bucket: process.env.S3_BUCKET,
    Delete: {
      Objects: evidence.map((e) => ({ Key: `evidence/${guild.id}/${e.id}` })),
      Quiet: true,
    },
  });

  await s3.send(cmd).catch((err) => {
    console.error(err);
    logger.error(`failed to delete all evidence in ${guild.id}`, {err});
  });

  await prisma.moderationEvidence.deleteMany({
    where: {
      guildId: guild.id,
    },
  });
}

export async function createEvidence(
  guild: Guild,
  caseId: number,
  userId: string,
  fileUrl: string,
  contentType: string,
) {
  logger.debug(`uploading case evidence`, { guildId: guild.id, caseId, userId });
  const id = nanoid();
  const key = `evidence/${guild.id}/${id}`;

  const res = await fetch(fileUrl);

  const buffer = await res.arrayBuffer();

  let image: Buffer;

  // discord strips exif - not an issue

  if (contentType.split("/")[1] === "png") {
    image = await sharp(buffer).webp({ nearLossless: true }).toBuffer();
    contentType = "image/webp";
  } else {
    image = Buffer.from(buffer);
  }

  // if (buffer.byteLength < image.length) image = Buffer.from(buffer);

  const success = await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: image,
      ContentType: contentType,
    }),
  ).catch((err) => {
    console.error(err);
    logger.error(`failed to upload evidence for case ${caseId} in ${guild.id}`, {err});
  });

  if (!success) return false;

  await prisma.moderationEvidence.create({
    data: {
      bytes: image.length,
      id,
      guildId: guild.id,
      caseId,
      userId,
    },
  });

  logger.debug("case evidence uploaded");

  return true;
}
