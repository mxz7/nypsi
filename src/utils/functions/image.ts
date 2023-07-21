import { variants } from "@catppuccin/palette";
import { WholesomeImage, WholesomeSuggestion } from "@prisma/client";
import { ColorResolvable, GuildMember, WebhookClient } from "discord.js";
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { RedditJSONPost } from "../../types/Reddit";
import { logger } from "../logger";
import { findChannelCluster } from "./clusters";
import { addProgress } from "./economy/achievements";
import requestDM from "./requestdm";

let wholesomeCache: WholesomeImage[];

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);
}

export async function redditImage(
  post: RedditJSONPost,
  allowed: RedditJSONPost[],
): Promise<string> {
  let image = post.data.url;

  if (image.includes("imgur.com/a/")) {
    post = allowed[Math.floor(Math.random() * allowed.length)];
    image = post.data.url;
  }

  if (image.includes("imgur") && !image.includes("gif")) {
    image = "https://i.imgur.com/" + image.split("/")[3];
    if (!isImageUrl(image)) {
      image = "https://i.imgur.com/" + image.split("/")[3] + ".gif";
    }
    return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
  }

  if (image.includes("gfycat")) {
    const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(
      (url) => url.json(),
    );

    if (link.gfyItem) {
      image = link.gfyItem.max5mbGif;
      return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
    }
  }

  let count = 0;

  while (!isImageUrl(image)) {
    if (count >= 10) {
      logger.warn("couldnt find image @ " + post.data.subreddit_name_prefixed);
      return "lol";
    }

    count++;

    post = allowed[Math.floor(Math.random() * allowed.length)];
    image = post.data.url;

    if (image.includes("imgur.com/a/")) {
      post = allowed[Math.floor(Math.random() * allowed.length)];
      image = post.data.url;
    }

    if (image.includes("imgur") && !image.includes("gif") && !image.includes("png")) {
      image = "https://i.imgur.com/" + image.split("/")[3];
      image = "https://i.imgur.com/" + image.split("/")[3] + ".png";
      if (!isImageUrl(image)) {
        image = "https://i.imgur.com/" + image.split("/")[3] + ".gif";
        return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
      }
    }

    if (image.includes("gfycat")) {
      const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(
        (url) => url.json(),
      );

      if (link) {
        image = link.gfyItem.max5mbGif;
        return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
      }
    }
  }

  let title = post.data.title;

  if (title.length >= 150) {
    const a = title.split("");
    let newTitle = "";
    let count = 0;

    for (const char of a) {
      if (count == 145) {
        newTitle = newTitle + "...";
        break;
      } else {
        count++;
        newTitle = newTitle + char;
      }
    }

    title = newTitle;
  }

  return image + "|" + title + "|" + post.data.permalink + "|" + post.data.author;
}

export async function suggestWholesomeImage(
  submitter: GuildMember,
  image: string,
): Promise<boolean> {
  const query1 = await prisma.wholesomeImage.findUnique({
    where: {
      image: image,
    },
    select: {
      id: true,
    },
  });

  if (query1) {
    return false;
  }

  const query2 = await prisma.wholesomeSuggestion.findUnique({
    where: {
      image: image,
    },
    select: {
      id: true,
    },
  });

  if (query2) {
    return false;
  }

  const { id } = await prisma.wholesomeSuggestion.create({
    data: {
      image: image,
      submitter: submitter.user.username,
      submitterId: submitter.user.id,
      uploadDate: new Date(),
    },
  });

  const embed = new CustomEmbed()
    .setColor(variants.latte.base.hex as ColorResolvable)
    .setTitle("wholesome suggestion #" + id);

  embed.setDescription(
    `**submitter** ${submitter.user.username} (${submitter.user.id})\n**url** ${image}`,
  );

  embed.setFooter({ text: "$ws review" });

  embed.setImage(image);

  const hook = new WebhookClient({ url: process.env.WHOLESOME_HOOK });

  await hook.send({ embeds: [embed] });
  hook.destroy();

  return true;
}

export async function acceptWholesomeImage(
  id: number,
  accepter: GuildMember,
  client: NypsiClient,
): Promise<boolean> {
  const query = await prisma.wholesomeSuggestion.findUnique({
    where: {
      id: id,
    },
  });

  if (!query) return false;

  await prisma.wholesomeImage.create({
    data: {
      image: query.image,
      submitter: query.submitter,
      submitterId: query.submitterId,
      uploadDate: query.uploadDate,
      accepterId: accepter.user.id,
    },
  });

  await prisma.wholesomeSuggestion.delete({
    where: {
      id: id,
    },
  });

  clearWholesomeCache();

  addProgress(query.submitterId, "wholesome", 1);
  logger.info(`${query.image} by ${query.submitterId} accepted by ${accepter.user.id}`);

  await requestDM({
    memberId: query.submitterId,
    client: client,
    content: `your wholesome image (${query.image}) has been accepted`,
  });

  return true;
}

export async function denyWholesomeImage(id: number, staff: GuildMember) {
  const d = await prisma.wholesomeSuggestion.delete({
    where: {
      id: id,
    },
  });

  if (!d) {
    return false;
  }

  logger.info(`${d.image} by ${d.submitterId} denied by ${staff.user.id}`);

  return true;
}

export async function getWholesomeImage(id?: number): Promise<WholesomeImage> {
  if (id) {
    const query = await prisma.wholesomeImage.findUnique({
      where: {
        id: id,
      },
    });
    return query;
  } else {
    if (wholesomeCache) {
      return wholesomeCache[Math.floor(Math.random() * wholesomeCache.length)];
    } else {
      const query = await prisma.wholesomeImage.findMany();

      wholesomeCache = query;

      return wholesomeCache[Math.floor(Math.random() * wholesomeCache.length)];
    }
  }
}

export function clearWholesomeCache() {
  wholesomeCache = undefined;
}

export async function deleteFromWholesome(id: number) {
  const query = await prisma.wholesomeImage.delete({
    where: {
      id: id,
    },
  });

  clearWholesomeCache();

  if (query) {
    return true;
  } else {
    return false;
  }
}

export async function getAllSuggestions(): Promise<WholesomeSuggestion[]> {
  const query = await prisma.wholesomeSuggestion.findMany();

  return query;
}

export async function uploadImage(
  client: NypsiClient,
  url: string,
  type: "avatar" | "wholesome",
  content?: string,
) {
  const channelId =
    type === "avatar"
      ? process.env.DISCORD_IMAGE_AVATAR_CHANNEL
      : process.env.DISCORD_IMAGE_WHOLESOME_CHANNEL;

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

  const res = await client.cluster.broadcastEval(
    async (c, { buffer, channelId, content, extension }) => {
      const channel = await c.channels.fetch(channelId).catch(() => {});

      if (!channel || !channel.isTextBased()) return "err: channel";

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
        .catch(() => {});

      if (!res) return "err: msg";

      return res.attachments.first().url;
    },
    {
      context: {
        buffer,
        channelId,
        content,
        extension: `.${url.split(".")[url.split(".").length - 1]}`,
      },
    },
  );

  const uploaded = res.filter((i) => Boolean(i))[0];

  logger.info("uploaded image", { original: url, uploaded, content, type });

  return uploaded;
}
