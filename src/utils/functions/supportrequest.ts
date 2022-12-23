import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";

export async function getSupportRequestByChannelId(id: string) {
  const query = await prisma.supportRequest.findFirst({
    where: {
      channelId: id,
    },
  });

  return query;
}

export async function getSupportRequest(id: string) {
  if (await redis.exists(`${Constants.redis.cache.SUPPORT}:${id}`)) {
    return await redis.get(`${Constants.redis.cache.SUPPORT}:${id}`);
  }

  const query = await prisma.supportRequest.findUnique({
    where: {
      userId: id,
    },
  });

  if (query) {
    await redis.set(`${Constants.redis.cache.SUPPORT}:${id}`, query.channelId);
    await redis.expire(`${Constants.redis.cache.SUPPORT}:${id}`, 900);
    return query.channelId;
  } else {
    return null;
  }
}

export async function createSupportRequest(id: string, client: NypsiClient, username: string) {
  const clusterHas = await client.cluster.broadcastEval(async (c) => {
    const client = c as NypsiClient;
    const channel = await client.channels.fetch("1015299117934723173").catch(() => {});

    if (channel) {
      return client.cluster.id;
    } else {
      return "not-found";
    }
  });

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
    async (c, { shard, username }) => {
      const client = c as NypsiClient;
      if (client.cluster.id != shard) return false;

      const channel = await client.channels.fetch("1015299117934723173");

      if (!channel) return false;

      if (!channel.isTextBased()) return;
      if (channel.isVoiceBased()) return;
      if (channel.isThread()) return;
      if (channel.isDMBased()) return;

      const thread = await channel.threads.create({ name: username });

      await thread.send({ content: "<@&747059949770768475> <@&845613231229370429> <@672793821850894347>" });

      return thread.id;
    },
    { context: { shard: shard, username: username } }
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
    .setDescription(`support request for ${username} (${id})`);

  await sendToRequestChannel(id, embed, client);

  return true;
}

export async function sendToRequestChannel(id: string, embed: CustomEmbed, client: NypsiClient) {
  const channelId = await getSupportRequest(id);

  if (!channelId) return false;

  const clusterHas = await client.cluster.broadcastEval(
    async (c, { channelId }) => {
      const client = c as NypsiClient;
      const channel = await client.channels.fetch(channelId).catch(() => {});

      if (channel) {
        return client.cluster.id;
      } else {
        return "not-found";
      }
    },
    { context: { channelId: channelId } }
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
      const client = c as NypsiClient;
      if (client.cluster.id != shard) return false;

      const channel = await client.channels.fetch(channelId);

      if (!channel) return false;

      if (!channel.isTextBased()) return;

      const msg = await channel.send({ embeds: [embed] }).catch(() => {});

      if (!msg) return false;
      return true;
    },
    { context: { shard: shard, embed: embed.toJSON(), channelId: channelId } }
  );

  if (!res.includes(true)) return false;

  return true;
}
