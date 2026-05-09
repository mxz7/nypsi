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
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { getCommandData, getCommandKeys } from "../../handlers/commandhandler";
import { logger } from "../../logger";
import { isLockedOut } from "../captcha";
import { getLevel, getPrestige } from "../economy/levelling";
import { isEcoBanned, userExists } from "../economy/utils";
import PageManager from "../page";
import { getLastCommand } from "../users/commands";
import { getLastKnownUsername } from "../users/username";
import openai, { buildPrompt, getDocsRaw } from "./openai";

const MODEL: ResponsesModel = "gpt-5.4-nano";
type ChatHistoryInput = { role: "user" | "assistant"; content: string };

const helpChatResponseFormat = z.object({
  can_answer: z.boolean(),
  answer: z.string().optional(),
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

export async function createHelpChat(userId: string, userQuery: string, conversationId?: string) {
  const conversation = conversationId
    ? await prisma.aiChatConversation.findUnique({
        where: {
          id: conversationId,
        },
      })
    : await prisma.aiChatConversation.create({
        data: {
          userId,
        },
      });

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

    const aiResponse = parsed.can_answer ? (parsed.answer ?? null) : null;

    await prisma.aiChatMessage.update({
      where: {
        id: chatMessage.id,
      },
      data: {
        aiResponse,
        model: MODEL,
        inputTokens: response.usage?.input_tokens ?? null,
        cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    });

    return {
      chatId: chatMessage.id,
      conversationId: conversation.id,
      aiResponse,
      canAnswer: parsed.can_answer,
    };
  } catch (e) {
    logger.error("help-chat: failed to generate ai response", { e, userId });
    return {
      chatId: chatMessage.id,
      conversationId: conversation.id,
      aiResponse: null,
      canAnswer: false,
    };
  }
}

export async function getAiChatConversationById(id: string) {
  return await prisma.aiChatConversation.findUnique({
    where: {
      id,
    },
  });
}

export async function getAiChatConversationMessages(conversationId: string) {
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
  conversationId: string,
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
