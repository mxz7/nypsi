import { SupportRequest } from "@prisma/client";
import { Attachment, Collection } from "discord.js";
import { nanoid } from "nanoid";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { logger } from "../logger";
import { uploadImage } from "./image";
import { prompt } from "./openai";
import { getLastKnownUsername } from "./users/tag";
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
    await redis.set(`${Constants.redis.cache.SUPPORT}:${id}`, JSON.stringify(query), "EX", 900);
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
    .setColor(Constants.PURPLE)
    .setDescription(
      `support request for [${username} (${id})](https://nypsi.xyz/user/${id}?ref=bot-support)`,
    );

  await sendToRequestChannel(id, embed, id, client);

  return true;
}

export async function sendToRequestChannel(
  id: string,
  embed: CustomEmbed,
  userId: string,
  client: NypsiClient,
) {
  const request = await getSupportRequest(id);

  if (!request?.channelId) return false;

  if (embed.data.description) {
    await prisma.supportRequestMessage.create({
      data: {
        userId,
        content: embed.data.description,
        supportRequestId: id,
      },
    });
  }

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
    async (c, { shard, embed, channelId, notify }) => {
      const client = c as unknown as NypsiClient;
      if (client.cluster.id != shard) return false;

      const channel = await client.channels.cache.get(channelId);

      if (!channel) return false;

      if (!channel.isSendable()) return;

      let content: string;

      if (notify) {
        content = notify.map((i) => `<@${i}>`).join(" ");
      }

      const msg = await channel.send({ embeds: [embed], content }).catch(() => {});

      if (!msg) return false;
      return true;
    },
    {
      context: {
        shard: shard,
        embed: embed.toJSON(),
        channelId: request.channelId,
        notify: request.notify,
      },
    },
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
        userId: id,
      },
      data: {
        notify: {
          set: request.notify.filter((i) => i != userId),
        },
      },
    });
  } else {
    await prisma.supportRequest.update({
      where: { userId: id },
      data: {
        notify: {
          push: userId,
        },
      },
    });
  }

  await redis.del(`${Constants.redis.cache.SUPPORT}:${id}`);

  return true;
}

export async function summariseRequest(id: string) {
  const request = await getSupportRequest(id);

  if (!request) return false;

  const messages = await prisma.supportRequestMessage.findMany({
    where: {
      supportRequestId: id,
    },
    select: {
      userId: true,
      content: true,
    },
  });

  let transcript = "";

  for (const message of messages) {
    transcript += `${await getLastKnownUsername(message.userId)}: ${message.content}\n\n`;
  }

  const res = await prompt(
    "You are a summarising assistant. " +
      'The following transcript is in the format of "<username>: <message content>". ' +
      "Some of the responses may be in an unknown language, translate them to English. " +
      "Your response should only be the summary of the transcription, please keep it as concise as possible. ",
    transcript,
  );

  return res;
}

export async function isRequestSuitable(content: string) {
  try {
    const aiResponse = await prompt(
      "# Role\n" +
        "You are part of a support team for the Discord bot 'nypsi'. " +
        "Your job is to determine if the user's message is suitable for a support request to be sent forwarded to a human. " +
        "The content may not be in English or may be bad English, do your best to understand it. " +
        "If you are unsure, lean on being accepting of the support request.\n" +
        "# Your response\n" +
        "## First line \n" +
        "- Respond with 'yes' for a suitable support request.\n" +
        "- Respond with 'no' for an unsuitable support request.\n" +
        "- Respond with 'needs more' where the user hasn't described their problem enough.\n" +
        "## Second line\n" +
        "The second line of the request should be a concise reason for your decision. " +
        "Avoid ending your reason with 'which is/not' suitable for support' this is understood from the given context. " +
        "Avoid starting your reason with 'the message', keep it as concise and quickly readable as possible.\n" +
        "# Examples\n" +
        "## Suitable requests\n" +
        "- Asking for help with an issue\n" +
        "- Reporting some type of bug\n" +
        "- Asking for some information about the bot\n" +
        "## Unsuitable requests\n" +
        "- Begging or asking for items or money\n" +
        "- Asking how long is left on their punishment\n" +
        "- Asking for a feature\n" +
        "## Needs more\n" +
        "- The user says they need help but doesn't say what they need help with\n",
      content,
    );

    const [decision, reason] = aiResponse.split("\n").map((i) => i.trim());

    return {
      decision,
      reason,
    };
  } catch (e) {
    logger.error("supportrequest: error while checking if suitable", { e, content });
    return { decision: "yes", reason: "ahhh" };
  }
}
