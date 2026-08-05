import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { Guild } from "discord.js";
import { nanoid } from "nanoid";
import prisma from "../../../init/database";
import s3 from "../../../init/s3";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { deleteObject, putObject } from "../s3";
import sharp = require("sharp");

const evidenceMaxCache = new RedisCache<number>(Constants.redis.cache.guild.EVIDENCE_MAX, 21600);

export async function getMaxEvidenceBytes(guild: Guild) {
  const cached = await evidenceMaxCache.get(guild.id);
  if (cached !== null) return cached;

  const query = await prisma.guildEvidenceCredit.findMany({
    where: {
      guildId: guild.id,
    },
    select: {
      bytes: true,
    },
  });

  let total = Constants.EVIDENCE_BASE;

  if (query.length > 0) total += Number(query.map((a) => a.bytes).reduce((a, b) => a + b));

  await evidenceMaxCache.set(guild.id, total);

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

  if (evidence) await deleteObject(`evidence/${guild.id}/${evidence.id}`);
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
    logger.error(`evidence: failed to delete all evidence in ${guild.id}`, {
      guildId: guild.id,
      err,
    });
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
  logger.debug(`evidence: uploading evidence for case ${caseId} in ${guild.id}`, {
    guildId: guild.id,
    caseId,
    userId,
  });
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

  const id = `${nanoid()}.${contentType.split("/")[1]}`;
  const key = `evidence/${guild.id}/${id}`;

  // if (buffer.byteLength < image.length) image = Buffer.from(buffer);

  const success = await putObject(key, image, contentType);

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

  logger.debug(`evidence: created evidence for case ${caseId} in ${guild.id}`, {
    guildId: guild.id,
    caseId,
    userId,
  });

  return true;
}
