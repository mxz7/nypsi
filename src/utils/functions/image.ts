import { variants } from "@catppuccin/palette";
import { Image, ImageSuggestion, ImageType } from "@prisma/client";
import { ClusterManager } from "discord-hybrid-sharding";
import { ColorResolvable, User, WebhookClient } from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { logger } from "../logger";
import { findChannelCluster } from "./clusters";
import { addProgress } from "./economy/achievements";
import { userExists } from "./economy/utils";
import sleep from "./sleep";
import { addNotificationToQueue } from "./users/notifications";
import { getLastKnownUsername } from "./users/tag";

let hook: WebhookClient;

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);
}

export async function suggestImage(
  submitterId: string,
  type: ImageType,
  imageUrl: string,
  client: NypsiClient | ClusterManager,
  extension?: string,
): Promise<"ok" | "limit" | "fail"> {
  const query = await prisma.imageSuggestion.count({
    where: {
      uploaderId: submitterId,
    },
  });

  if (query > 5 && submitterId !== Constants.BOT_USER_ID) return "limit";

  const url = await uploadImage(
    client,
    imageUrl,
    "image",
    `image suggestion ${type} uploaded by ${submitterId}`,
    extension,
  );

  if (!url) return "fail";

  const { id } = await prisma.imageSuggestion.create({
    data: {
      url: url,
      uploaderId: submitterId,
      type,
    },
  });

  const embed = new CustomEmbed()
    .setColor(variants.latte.base.hex as ColorResolvable)
    .setTitle("image suggestion #" + id);

  const username = await getLastKnownUsername(submitterId);

  embed.setDescription(
    `**uploader** ${submitterId} (${
      username ? username : "unknown"
    })\n**url** ${url}\n**type** ${type.toUpperCase()}`,
  );

  embed.setFooter({ text: "$x review" });

  embed.setImage(url);

  if (!hook) hook = new WebhookClient({ url: process.env.WHOLESOME_HOOK });

  hook
    .send({ embeds: [embed] })
    .catch(() => (hook = new WebhookClient({ url: process.env.WHOLESOME_HOOK })));

  return "ok";
}

export async function getRandomImage(type: ImageType) {
  const cache = await redis.get(`${Constants.redis.cache.IMAGE}:${type}`);

  let images: Image[];

  if (cache) {
    images = JSON.parse(cache) as Image[];
  } else {
    images = await prisma.image.findMany({
      where: {
        type,
      },
    });

    await redis.set(`${Constants.redis.cache.IMAGE}:${type}`, JSON.stringify(images), "EX", 86400);
  }

  const chosen = images[Math.floor(Math.random() * images.length)];

  prisma.image.update({
    where: { id: chosen.id },
    data: { views: { increment: 1 } },
  });

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

    addNotificationToQueue({
      memberId: image.uploaderId,
      payload: { content: `your image (${image.url}) has been accepted` },
    });
    if (await userExists(image.uploaderId)) addProgress(image.uploaderId, "wholesome", 1);
  } else {
    logger.info(`admin: ${mod.id} (${mod.username}) denied suggestion by ${image.uploaderId}`);
  }
}

export async function uploadImage(
  client: NypsiClient | ClusterManager,
  url: string,
  type: "avatar" | "image",
  content?: string,
  extension?: string,
) {
  if (await redis.exists("nypsi:uploadimg")) {
    await sleep(Math.floor(Math.random() * 400) + 100);
    return uploadImage(client, url, type, content, extension);
  }

  await redis.set("nypsi:uploadimg", "boobies", "EX", 5);

  const channelId =
    type === "avatar"
      ? process.env.DISCORD_IMAGE_AVATAR_CHANNEL
      : process.env.DISCORD_IMAGE_CHANNEL;

  if (!channelId) {
    await redis.del("nypsi:uploadimg");
    logger.error("invalid channel for image upload", { url, type, content });
    return;
  }

  const imageBlob = await fetch(url)
    .then((r) => r.blob())
    .catch(() => {});

  if (!imageBlob) {
    await redis.del("nypsi:uploadimg");
    logger.error("failed converting image url to blob", { url, type, content });
    return;
  }

  const buffer = await imageBlob
    .arrayBuffer()
    .then((r) => Buffer.from(r))
    .catch(() => {});

  if (!buffer) {
    await redis.del("nypsi:uploadimg");
    logger.error("failed converting image blob to buffer", { url, type, content });
    return;
  }

  const cluster = await findChannelCluster(client, channelId);

  if (typeof cluster.cluster !== "number") {
    await redis.del("nypsi:uploadimg");
    return;
  }

  const res = await (client instanceof ClusterManager ? client : client.cluster).broadcastEval(
    async (c, { buffer, channelId, content, extension, cluster }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = c.channels.cache.get(channelId);

      if (!channel || !channel.isTextBased())
        return { msg: "err: fetching channel", error: channel };

      const res = await channel
        .send({
          content,
          files: [
            {
              attachment: Buffer.from(buffer.data),
              name: `${Math.floor(Math.random() * 69420)}_image${extension}`,
            },
          ],
        })
        .catch((e: any) => e);

      if (!res) return { error: res, msg: "err: message" };

      return res.attachments.first().url;
    },
    {
      context: {
        buffer,
        channelId,
        content,
        extension: extension
          ? `.${extension}`
          : `.${url.split(".")[url.split(".").length - 1].split("?")[0]}`,
        cluster: cluster.cluster,
      },
    },
  );

  const uploaded = res.filter((i) => Boolean(i))[0];

  if (typeof uploaded !== "string") {
    await redis.del("nypsi:uploadimg");
    logger.error("failed to upload image", { ...uploaded, url, content, type });
    return;
  }

  setTimeout(() => {
    redis.del("nypsi:uploadimg");
  }, 5000);

  logger.info("uploaded image", { original: url, uploaded, content, type });

  return uploaded;
}
