import { SupportRequest } from "@prisma/client";
import { Attachment, Collection } from "discord.js";
import { nanoid } from "nanoid";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { uploadImage } from "./image";
import pAll = require("p-all");

export async function getSupportRequestByChannelId(id: string) {
  const query = await prisma.supportRequest.findUnique({
    where: {
      channelId: id,
    },
  });

  return query;
}

export async function getSupportRequest(id: string): Promise<SupportRequest> {
  if (await redis.exists(`${Constants.redis.cache.SUPPORT}:${id}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.SUPPORT}:${id}`));
  }

  const query = await prisma.supportRequest.findUnique({
    where: {
      userId: id,
    },
  });

  if (query) {
    await redis.set(`${Constants.redis.cache.SUPPORT}:${id}`, JSON.stringify(query));
    await redis.expire(`${Constants.redis.cache.SUPPORT}:${id}`, 900);
    return query;
  } else {
    return null;
  }
}

export async function createSupportRequest(id: string, client: NypsiClient, username: string) {
  const clusterHas = await client.cluster.broadcastEval(
    async (c, { channelId }) => {
      const client = c as unknown as NypsiClient;
      const channel = client.channels.cache.get(channelId);

      if (channel) {
        return client.cluster.id;
      } else {
        return "not-found";
      }
    },
    { context: { channelId: Constants.SUPPORT_CHANNEL_ID } },
  );

  let shard: number;

  for (const i of clusterHas) {
    if (i != "not-found") {
      shard = i;
      break;
    }
  }

  if (isNaN(shard)) {
    return false;
  }

  const res = await client.cluster.broadcastEval(
    async (c, { shard, username, channelId, roleId }) => {
      const client = c as unknown as NypsiClient;
      if (client.cluster.id != shard) return false;

      const channel = await client.channels.cache.get(channelId);

      if (!channel) return false;

      if (!channel.isTextBased()) return;
      if (channel.isVoiceBased()) return;
      if (channel.isThread()) return;
      if (channel.isDMBased()) return;

      const thread = await channel.threads.create({ name: username });

      await thread.send({
        content: `<@&${roleId}>`,
      });

      return thread.id;
    },
    {
      context: {
        shard: shard,
        username: username,
        channelId: Constants.SUPPORT_CHANNEL_ID,
        roleId: Constants.SUPPORT_ROLE_ID,
      },
    },
  );

  let channelId: string;

  for (const item of res) {
    if (typeof item == "string") channelId = item;
  }

  if (!channelId) return false;

  await prisma.supportRequest.create({
    data: {
      channelId: channelId,
      userId: id,
    },
  });

  const embed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setDescription(`support request for [${username} (${id})](https://nypsi.xyz/user/${id})`);

  await sendToRequestChannel(id, embed, client);

  return true;
}

export async function sendToRequestChannel(id: string, embed: CustomEmbed, client: NypsiClient) {
  const request = await getSupportRequest(id);

  if (!request?.channelId) return false;

  const clusterHas = await client.cluster.broadcastEval(
    async (c, { channelId }) => {
      const client = c as unknown as NypsiClient;
      const channel = client.channels.cache.get(channelId);

      if (channel) {
        return client.cluster.id;
      } else {
        return "not-found";
      }
    },
    { context: { channelId: request.channelId } },
  );

  let shard: number;

  for (const i of clusterHas) {
    if (i != "not-found") {
      shard = i;
      break;
    }
  }

  if (isNaN(shard)) {
    return false;
  }

  const res = await client.cluster.broadcastEval(
    async (c, { shard, embed, channelId }) => {
      const client = c as unknown as NypsiClient;
      if (client.cluster.id != shard) return false;

      const channel = await client.channels.cache.get(channelId);

      if (!channel) return false;

      if (!channel.isSendable()) return;

      const msg = await channel.send({ embeds: [embed] }).catch(() => {});

      if (!msg) return false;
      return true;
    },
    { context: { shard: shard, embed: embed.toJSON(), channelId: request.channelId } },
  );

  if (!res.includes(true)) return false;

  return true;
}

export async function handleAttachments(attachments: Collection<string, Attachment>) {
  const urls: string[] = [];

  for (const attachment of attachments.values()) {
    if (attachment.size > 1e8) return "too big";
  }

  const promises = [];

  for (const attachment of attachments.values()) {
    promises.push(async () => {
      const arrayBuffer = await fetch(attachment.url).then((res) => res.arrayBuffer());

      const key = `support/${nanoid(7)}.${attachment.contentType.split("/")[1]}`;

      const uploadRes = await uploadImage(
        key,
        Buffer.from(arrayBuffer),
        attachment.contentType,
      ).catch(() => false);

      if (!uploadRes) return false;

      urls.push(`https://cdn.nypsi.xyz/${key}`);
    });
  }

  await pAll(promises, { concurrency: 2 });

  return urls;
}

export async function toggleNotify(id: string, userId: string) {
  const request = await getSupportRequest(id);

  if (!request) return false;

  if (request.notify.includes(userId)) {
    await prisma.supportRequest.update({
      where: {
        channelId: id,
      },
      data: {
        notify: {
          set: request.notify.filter((i) => i != userId),
        },
      },
    });
  } else {
    await prisma.supportRequest.update({
      where: { channelId: id },
      data: {
        notify: {
          push: userId,
        },
      },
    });
  }

  return true;
}
