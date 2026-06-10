import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { parse } from "@twemoji/parser";
import sharp from "sharp";
import prisma from "../../init/database";
import redis from "../../init/redis";
import s3 from "../../init/s3";
import Constants from "../Constants";

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);
}

type Image = {
  id: string;
  type: string;
  name?: string;
  likes: number;
  reports: number;
  url: string;
  image: string;
};

export async function getRandomImage(type: string) {
  const cache = await redis.get(`${Constants.redis.cache.IMAGE}:${type}`);

  let images: Image[];

  if (cache) {
    images = JSON.parse(cache) as Image[];
  } else {
    images = await fetch(`https://animals.maxz.dev/api/${type}/all`).then((r) =>
      r.json().then((i) => i.map((i: any) => ({ id: i.id, url: i.image, name: i.name }))),
    );

    await redis.set(`${Constants.redis.cache.IMAGE}:${type}`, JSON.stringify(images), "EX", 86400);
  }

  const chosen = images[Math.floor(Math.random() * images.length)];

  return chosen;
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

export async function dhash(input: Buffer): Promise<bigint> {
  const size = 16;

  const { data } = await sharp(input)
    .resize(size + 1, size, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = data[y * (size + 1) + x];
      const right = data[y * (size + 1) + x + 1];
      hash = (hash << 1n) | (left < right ? 1n : 0n);
    }
  }

  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}

// the mr beast twitter scam images
const scamImages = [
  70806595034094802434197228670771698004542809934543937388893117000598274840616n,
  16299498945533816812946099902609874616368689868885371594108161188289690714651n,
  72709621701496836174492615962861494187683811105911528458021576705924029629438n,
  21716678152258230268502918861209221640347971977606760092143576553946478608384n,
  87536125318850282896229945598828771670253211168242138766008445263415792484653n,
  29971304855934377174829943056032778000068407746361159067457232809113069920024n,
];

export async function isScamImage(
  url: string,
): Promise<{ scam: boolean; distance?: number; timeTaken?: { total: number; hash: number } }> {
  const buffer = await fetch(url)
    .then((r) => r.arrayBuffer())
    .then((b) => Buffer.from(b));

  const before = performance.now();

  const hash = await dhash(buffer);

  const afterHash = performance.now();

  let closest: number;

  for (const scamHash of scamImages) {
    closest = hammingDistance(hash, scamHash);
    if (closest <= 10) {
      return {
        scam: true,
        distance: closest,
        timeTaken: { total: performance.now() - before, hash: afterHash - before },
      };
    }
  }

  return {
    scam: false,
    distance: closest,
    timeTaken: { total: performance.now() - before, hash: afterHash - before },
  };
}
