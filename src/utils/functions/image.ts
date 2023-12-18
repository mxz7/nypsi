import { variants } from "@catppuccin/palette";
import { ImageType } from "@prisma/client";
import { ClusterManager } from "discord-hybrid-sharding";
import { ColorResolvable, WebhookClient } from "discord.js";
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { logger } from "../logger";
import { findChannelCluster } from "./clusters";
import { getLastKnownUsername } from "./users/tag";

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);
}

export async function suggestImage(
  submitterId: string,
  type: ImageType,
  imageUrl: string,
  client: NypsiClient,
): Promise<"ok" | "limit" | "fail"> {
  const query = await prisma.imageSuggestion.count({
    where: {
      uploaderId: submitterId,
    },
  });

  if (query > 5) return "limit";

  const res = await uploadImage(
    client,
    imageUrl,
    "image",
    `image suggestion ${type} uploaded by ${submitterId}`,
  );

  if (!res) return "fail";

  const { id } = await prisma.imageSuggestion.create({
    data: {
      url: res,
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
    })\n**url** ${res}\n**type** ${type.toUpperCase()}`,
  );

  embed.setFooter({ text: "$x img review" });

  embed.setImage(res);

  const hook = new WebhookClient({ url: process.env.WHOLESOME_HOOK });

  await hook.send({ embeds: [embed] });
  hook.destroy();

  return "ok";
}

export async function uploadImage(
  client: NypsiClient | ClusterManager,
  url: string,
  type: "avatar" | "image",
  content?: string,
) {
  const channelId =
    type === "avatar"
      ? process.env.DISCORD_IMAGE_AVATAR_CHANNEL
      : process.env.DISCORD_IMAGE_CHANNEL;

  if (!channelId) {
    logger.error("invalid channel for image upload", { url, type, content });
    return;
  }

  const imageBlob = await fetch(url)
    .then((r) => r.blob())
    .catch(() => {});

  if (!imageBlob) {
    logger.error("failed converting image url to blob", { url, type, content });
    return;
  }

  const buffer = await imageBlob
    .arrayBuffer()
    .then((r) => Buffer.from(r))
    .catch(() => {});

  if (!buffer) {
    logger.error("failed converting image blob to buffer", { url, type, content });
    return;
  }

  const cluster = await findChannelCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

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
        extension: `.${url.split(".")[url.split(".").length - 1].split("?")[0]}`,
        cluster: cluster.cluster,
      },
    },
  );

  const uploaded = res.filter((i) => Boolean(i))[0];

  if (typeof uploaded !== "string") {
    logger.error("failed to upload image", { ...uploaded, url, content, type });
    return;
  }

  logger.info("uploaded image", { original: url, uploaded, content, type });

  return uploaded;
}
