import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { zodTextFormat } from "openai/helpers/zod";
import { ResponsesModel } from "openai/resources";
import { z } from "zod";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getCommandData, getCommandKeys } from "../../handlers/commandhandler";
import { logger } from "../../logger";
import { isLockedOut } from "../captcha";
import { getLevel, getPrestige } from "../economy/levelling";
import { isEcoBanned, userExists } from "../economy/utils";
import PageManager from "../page";
import { getLastCommand } from "../users/commands";
import { getLastKnownUsername } from "../users/username";
import { createProfile, hasProfile } from "../users/utils";
import openai, { buildPrompt, getDocsRaw } from "./openai";

const MODEL: ResponsesModel = "gpt-5.4-nano";
type ChatHistoryInput = { role: "user" | "assistant"; content: string };

// per-user: max messages per week
const USER_WEEKLY_LIMIT = 20;
// global: max total output tokens across all users per week before the feature is paused
const GLOBAL_WEEKLY_TOKEN_LIMIT = 5_000_000;
// TTL to the next Monday 00:00 UTC (approx — capped at 7 days)
function weekTtl(): number {
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + ((8 - now.getUTCDay()) % 7 || 7));
  nextMonday.setUTCHours(0, 0, 0, 0);
  return Math.max(Math.floor((nextMonday.getTime() - now.getTime()) / 1000), 1);
}

const helpChatResponseFormat = z.object({
  confident: z.boolean(),
  answer: z.string(),
});

export type HelpChatPage = {
  userQuery: string;
  aiResponse: string | null;
};

function getCommandList() {
  const rows: string[] = [];

  for (const commandName of Array.from(getCommandKeys()).sort((a, b) => a.localeCompare(b))) {
    const command = getCommandData(commandName);
    if (!command) continue;

    rows.push(
      [
        `command: ${command.name}`,
        `description: ${command.description}`,
        `permissions: ${command.permissions?.join(", ") || "none"}`,
        `docs: ${command.docs || "none"}`,
        `aliases: ${command.aliases?.join(", ") || "none"}`,
      ].join(" | "),
    );
  }

  return rows.join("\n");
}

async function getUserContext(userId: string) {
  const context: Record<string, string> = {
    exists: "false",
    username: "null",
    last_command: "null",
    currently_banned: "null",
    captcha: "null",
    prestige: "null",
    level: "null",
  };

  if (await userExists(userId)) {
    context.exists = "true";
    context.username = await getLastKnownUsername(userId, false);
    context.last_command = (await getLastCommand(userId)).toISOString();
    context.captcha = Boolean(await isLockedOut(userId)).toString();
    context.prestige = ((await getPrestige(userId)) || 0).toString();
    context.level = ((await getLevel(userId)) || 0).toString();

    const ecoBan = await isEcoBanned(userId);

    if (ecoBan.banned) {
      context.currently_banned = "true";

      if (ecoBan.bannedAccount !== userId) {
        const username = await getLastKnownUsername(ecoBan.bannedAccount, false);
        context.currently_banned += `, linked to ${username}`;
      }
    } else {
      context.currently_banned = "false";
    }
  }

  return buildPrompt("user_context", context);
}

export async function isHelpChatAvailable(): Promise<boolean> {
  const globalTokens = parseInt(
    (await redis.get(Constants.redis.cooldown.HELP_CHAT_GLOBAL_TOKENS)) || "0",
  );
  return globalTokens < GLOBAL_WEEKLY_TOKEN_LIMIT;
}

export async function createHelpChat(userId: string, userQuery: string, conversationId?: number) {
  // global token budget check
  const globalTokens = parseInt(
    (await redis.get(Constants.redis.cooldown.HELP_CHAT_GLOBAL_TOKENS)) || "0",
  );
  if (globalTokens >= GLOBAL_WEEKLY_TOKEN_LIMIT) {
    logger.warn("help-chat: global weekly token limit reached", { globalTokens });
    return {
      chatId: null as number | null,
      conversationId: conversationId ?? null,
      aiResponse: null as string | null,
      confident: true,
      rateLimited: true as const,
    };
  }

  // per-user weekly message limit
  const userKey = `${Constants.redis.cooldown.HELP_CHAT_USER}:${userId}`;
  const userCount = parseInt((await redis.get(userKey)) || "0");
  if (userCount >= USER_WEEKLY_LIMIT) {
    logger.info("help-chat: user weekly limit reached", { userId, userCount });
    return {
      chatId: null as number | null,
      conversationId: (conversationId ?? null) as number | null,
      aiResponse: null as string | null,
      confident: true,
      rateLimited: true as const,
    };
  }

  const conversation = conversationId
    ? await prisma.aiChatConversation.findUnique({
        where: {
          id: conversationId,
        },
      })
    : await (async () => {
        if (!(await hasProfile(userId))) await createProfile(userId);
        return prisma.aiChatConversation.create({
          data: {
            userId,
          },
        });
      })();

  if (!conversation || conversation.userId !== userId) {
    throw new Error("invalid ai help conversation");
  }

  const previousMessages = await prisma.aiChatMessage.findMany({
    where: {
      conversationId: conversation.id,
      aiResponse: {
        not: null,
      },
    },
    select: {
      userQuery: true,
      aiResponse: true,
    },
    orderBy: {
      id: "desc",
    },
  });

  const chatMessage = await prisma.aiChatMessage.create({
    data: {
      conversationId: conversation.id,
      userQuery,
      model: MODEL,
    },
  });

  try {
    const prompt = buildPrompt("help_chatbot", {
      documentation: await getDocsRaw(),
      commands: getCommandList(),
    });
    const userContext = await getUserContext(userId);
    const historyInput: ChatHistoryInput[] = previousMessages.reverse().flatMap((message) => [
      { role: "user", content: message.userQuery },
      { role: "assistant", content: message.aiResponse as string },
    ]);

    const response = await openai.responses.parse({
      model: MODEL,
      input: [
        { role: "system", content: prompt },
        { role: "system", content: userContext },
        ...historyInput,
        { role: "user", content: userQuery },
      ],
      text: { format: zodTextFormat(helpChatResponseFormat, "help_chat_response") },
    });

    const parsed = response.output_parsed;

    if (!parsed) {
      throw new Error("empty help ai response");
    }

    const disclaimerSuffix = `\n\n*I'm not fully confident in this answer. For more accurate help, join the [official nypsi server](${Constants.NYPSI_SERVER_INVITE_LINK})*`;
    const aiResponse = parsed.confident ? parsed.answer : parsed.answer + disclaimerSuffix;

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const cachedInputTokens = response.usage?.input_tokens_details?.cached_tokens ?? 0;

    logger.info("help-chat: query", {
      userId,
      confident: parsed.confident,
      query: userQuery,
      response: aiResponse,
      tokens: { input: inputTokens, cachedInput: cachedInputTokens, output: outputTokens },
    });

    await prisma.aiChatMessage.update({
      where: {
        id: chatMessage.id,
      },
      data: {
        aiResponse,
        model: MODEL,
        inputTokens: inputTokens || null,
        cachedInputTokens: cachedInputTokens || null,
        outputTokens: outputTokens || null,
      },
    });

    // increment counters
    const ttl = weekTtl();
    await redis.incrby(Constants.redis.cooldown.HELP_CHAT_GLOBAL_TOKENS, outputTokens);
    await redis.expire(Constants.redis.cooldown.HELP_CHAT_GLOBAL_TOKENS, ttl);
    const newUserCount = await redis.incr(userKey);
    if (newUserCount === 1) await redis.expire(userKey, ttl);

    return {
      chatId: chatMessage.id,
      conversationId: conversation.id,
      aiResponse,
      confident: parsed.confident,
      rateLimited: false as const,
    };
  } catch (e) {
    logger.error("help-chat: failed to generate ai response", { e, userId });
    return {
      chatId: chatMessage.id,
      conversationId: conversation.id,
      aiResponse: null as string | null,
      confident: true,
      rateLimited: false as const,
    };
  }
}

export async function getAiChatConversationById(id: number) {
  return await prisma.aiChatConversation.findUnique({
    where: {
      id,
    },
  });
}

export async function getAiChatConversationMessages(conversationId: number) {
  return await prisma.aiChatMessage.findMany({
    where: {
      conversationId,
    },
    select: {
      userQuery: true,
      aiResponse: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export function buildHelpPageEmbed(
  userId: string,
  page: HelpChatPage,
  icon: string | undefined,
  pageNumber: number,
  lastPage: number,
): CustomEmbed {
  return new CustomEmbed(userId)
    .setHeader("nypsi help", icon)
    .addField("your question", page.userQuery)
    .addField("answer", page.aiResponse || "*thinking...*")
    .setFooter({
      text: `this service is powered by AI and can make mistakes • page ${pageNumber}/${lastPage}`,
    });
}

export function createHelpPageRows(
  singlePage = false,
  disableContinue = false,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (!singlePage) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("⬅")
          .setLabel("back")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId("➡")
          .setLabel("next")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help-ai-continue")
        .setLabel("ask another question")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disableContinue),
    ),
  );

  return rows;
}

export function buildCannotAnswerEmbed(userId: string, icon: string | undefined): CustomEmbed {
  return new CustomEmbed(userId)
    .setHeader("nypsi help", icon)
    .setDescription(
      "a confident answer couldn't be generated for your question\n\nyou can try rephrasing your question, or talk directly to a nypsi staff member",
    );
}

export function buildRateLimitedEmbed(userId: string, icon: string | undefined): CustomEmbed {
  return new CustomEmbed(userId)
    .setHeader("nypsi help", icon)
    .setDescription(
      "the AI help feature is temporarily unavailable, either you've reached your weekly question limit or the service is under high demand\n\nplease try again next week, or talk directly to a nypsi staff member",
    );
}

export function createCannotAnswerRows(): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help-ai-support")
        .setLabel("talk to staff")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export async function preparePagesFromConversation(
  conversationId: number,
): Promise<{ pages: Map<number, HelpChatPage[]>; lastPage: number } | null> {
  const pagesData = await getAiChatConversationMessages(conversationId);

  const pages = PageManager.createPages<HelpChatPage>(
    pagesData
      .filter((i) => i.aiResponse !== null)
      .map((i) => ({
        userQuery: i.userQuery,
        aiResponse: i.aiResponse as string,
      })),
    1,
  );

  const lastPage = pages.size;

  if (lastPage === 0) {
    return null;
  }

  return { pages, lastPage };
}
