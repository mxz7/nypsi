import { ResponsesModel } from "openai/resources";
import prisma from "../../init/database";
import { getCommandData, getCommandKeys } from "../handlers/commandhandler";
import { logger } from "../logger";
import { isLockedOut } from "./captcha";
import { getLevel, getPrestige } from "./economy/levelling";
import { isEcoBanned, userExists } from "./economy/utils";
import openai, { buildPrompt, getDocsRaw } from "./openai";
import { getLastCommand } from "./users/commands";
import { getLastKnownUsername } from "./users/username";

const MODEL: ResponsesModel = "gpt-5.4-nano";
type ChatHistoryInput = { role: "user" | "assistant"; content: string };

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

    const response = await openai.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: prompt },
        { role: "system", content: userContext },
        ...historyInput,
        { role: "user", content: userQuery },
      ],
    });

    const aiResponse = response.output_text?.trim();

    if (!aiResponse) {
      throw new Error("empty help ai response");
    }

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

    return { chatId: chatMessage.id, conversationId: conversation.id, aiResponse };
  } catch (e) {
    logger.error("help-chat: failed to generate ai response", { e, userId });
    return { chatId: chatMessage.id, conversationId: conversation.id, aiResponse: null };
  }
}

export async function getAiChatConversationById(id: string) {
  return await prisma.aiChatConversation.findUnique({
    where: {
      id,
    },
  });
}
