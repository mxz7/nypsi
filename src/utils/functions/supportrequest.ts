import { SupportRequest } from "@prisma/client";
import { Attachment, Collection, Embed } from "discord.js";
import { nanoid } from "nanoid";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { logger } from "../logger";
import { uploadImage } from "./image";
import openai, { getDocsRaw, prompt } from "./openai";
import { getLastKnownUsername } from "./users/tag";
import pAll = require("p-all");

export const quickResponses = new Map<string, string>();

quickResponses.set(
  "auto.scam",
  "for scamming the burden is on you to provide evidence and we just verify it and decide if a punishment is worthy\n\n" +
    "you need to clearly show:\n" +
    "- the agreement of terms\n" +
    "- the payment\n" +
    "- the refusal when the terms are met\n\n" +
    "**please label each screenshot and send it together in one message, chronologically**\n\n" +
    "the easier you make it for our staff, the more likely it is you will get a positive outcome.\n" +
    "*if you're unable to provide sufficient evidence, then unfortunately nothing can be done.*",
);

quickResponses.set(
  "auto.transfer",
  "it sounds like you're asking about a **profile transfer** where data from one account will be applied to another\n\n" +
    "you must provide evidence the old account username and user ID, as well as prove that it is your account\n\n" +
    "if you're unable to prove that it's your account, we cannot do anything.",
);

quickResponses.set(
  "auto.buyunban",
  "if you are **banned/muted from the nypsi discord server** then you can be unbanned/unmuted by making a custom donation of £20 to https://ko-fi.com/tekoh\n\n" +
    "if you are **banned from nypsi economy** you can buy an unban from https://ko-fi.com/s/1d78b621a5",
);

const isRequestSuitableFormat = z.object({
  valid: z.boolean(),
  reason: z.string(),
  answer: z.string().nullable(),
});

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
      latestActivity: new Date(),
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
  forwardedEmbeds?: Embed[],
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

    await prisma.supportRequest.update({
      where: {
        userId,
      },
      data: {
        latestActivity: new Date(),
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
    async (c, { shard, embeds, channelId, notify }) => {
      const client = c as unknown as NypsiClient;
      if (client.cluster.id != shard) return false;

      const channel = await client.channels.cache.get(channelId);

      if (!channel) return false;

      if (!channel.isSendable()) return;

      let content: string;

      if (notify) {
        content = notify.map((i) => `<@${i}>`).join(" ");
      }

      const msg = await channel.send({ embeds: embeds, content }).catch(() => {});

      if (!msg) return false;
      return true;
    },
    {
      context: {
        shard: shard,
        embeds: [embed.toJSON(), ...(forwardedEmbeds?.map((e) => e.toJSON()) || [])],
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

export async function isRequestSuitable(
  content: string,
): Promise<{ decision: boolean; reason: string; answer?: string }> {
  const sysPrompt = [
    "# Role",
    "You are part of a support team for the Discord bot **nypsi**.",
    "Your job is to determine if the user's message is suitable for a support request to be forwarded to a human.",
    "The content may not be in English or may be written in poor English — do your best to understand it.",
    "If you are unsure, lean on being accepting of the support request.",
    "",
    "You have access to the nypsi documentation in your context. Use it to help you understand the user's query.",
    "",
    "Assume that the user is referring to nypsi or nypsi features with their request, including money.",
    "",
    "## Your Response",
    "",
    "### Valid",
    "This is for the validity of the support request, 'true' will send it to staff, 'false' will block it from going to staff.",
    "",
    "#### true",
    "The decision will be 'true' for a suitable support request.",
    "If the user is a question that appears to be relevant to the bot, but isn't in the documentation, you should still choose 'yes'.",
    "",
    "#### false",
    "The decision will be 'false' for an unsuitable support request.",
    "",
    "### Reason",
    "",
    "This should be a **concise reason** for your decision.",
    "",
    '* Avoid ending your reason with "which is/not suitable for support" — this is understood from the context.',
    '* Avoid starting your reason with "the message" — keep it direct and quickly readable.',
    "",
    "### Answer",
    "",
    "This should only be used when the choice is 'yes' **AND** when you are able to provide a **DIRECT** answer to the user's question based on the documentation. Do not provide an anser if you can't answer the user's question directly with information from the documentation. You are not having a conversation, this is a one response answer.",
    "Your answer should be concise and easy to understand for a range of audiences. If suggesting commands, use the '$' dollar sign as a prefix for the command.",
    "Do not tell the user to 'dm nypsi' or to 'create a support request', they are already doing that.",
    "Do not tell the user to 'ask a question', they are already asking a question, you will not have further communication with this user.",
    "Even if you can't answer the user's question, it could still be a suitable support request. The documentation does not include everything.",
    "",
    "If the user is suggesting a new feature, you should accept the support request, but tell them to use the suggestions channel.",
    "",
    "## Examples",
    "",
    "### Suitable Requests",
    "* Asking for help with an issue",
    "* Asking for help with commands",
    "* Reporting some type of bug",
    "* Asking for some information about the bot",
    "* Asking how to do something",
    "* Asking for help with the nypsi discord server",
    "* Saying that they will send screenshots, videos etc",
    "* Asking about a feature",
    "* Suggesting a new feature",
    "",
    "### Unsuitable Requests",
    "* Begging/demanding for items or money",
    "* Asking for a feature",
    "* Asking to be staff",
    "* Nonsensical or random words",
    "* Not asking for anything",
    "",
    "",
  ];

  sysPrompt.push(await getDocsRaw());

  try {
    const response = await openai.responses.parse({
      model: "gpt-4.1-mini",
      instructions: sysPrompt.join("\n"),
      input: [{ role: "user", content }],
      text: { format: zodTextFormat(isRequestSuitableFormat, "supportrequest_suitable") },
    });

    logger.debug(`support request ai tokens`, {
      cost: {
        input: {
          used: response.usage?.input_tokens,
          cached: response.usage?.input_tokens_details?.cached_tokens,
        },
        output: response.usage?.output_tokens,
      },
    });

    return {
      decision: response.output_parsed.valid,
      reason: response.output_parsed.reason,
      answer: response.output_parsed.answer,
    };
  } catch (e) {
    logger.error("supportrequest: error while checking if suitable", { e, content });
    return { decision: true, reason: "ahhh" };
  }
}

export async function getQuickSupportResponse(content: string) {
  const res = await prompt(
    "# Role\n\n" +
      "You are a support agent for the 'nypsi' Discord bot. You are an assistance to the staff members of nypsi, helping save their time by instantly responding to a user's query with instructions on how to give the correct information.\n\n" +
      "## Your response\n\n" +
      "Your response should **ONLY** be one of the following:\n" +
      "- auto.scam\n" +
      "Should be used when the user is claiming that they have been scammed by another user.\n\n" +
      "- auto.transfer\n" +
      "Should be used when the user is asking for a profile transfer, where data from one account is being transferred to another.\n\n" +
      "- auto.buyunban\n" +
      "Should be used when the user is asking to be unbanned, or are inquiring on how to be unbanned.\n\n" +
      "- no\n" +
      "Used when none of the other options apply, and you are unable to assist the user. Use this when you are unsure.\n\n" +
      "## Examples\n\n" +
      "### Unbanned\n\n" +
      "If the user is asking to be unbanned, or when they are unbanned, respond with 'auto.buyunban'",
    content,
  );

  if (quickResponses.has(res)) {
    return quickResponses.get(res);
  }
}
