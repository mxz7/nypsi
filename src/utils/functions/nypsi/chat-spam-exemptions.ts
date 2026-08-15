import { Message } from "discord.js";
import redis from "../../../init/redis";
import Constants from "../../Constants";

const gameMessages = new WeakSet<Message>();
const CAT_BOT_ID = "966695034340663367";
const CAT_RESPONSE_WINDOW_MS = 30000;
const CAT_RESPONSE_TTL_SECONDS = 60;

function getCatResponseKey(channelId: string) {
  return `nypsi:chat-spam:cat-response:${channelId}`;
}

export function markGameMessage(message: Message) {
  gameMessages.add(message);
}

export async function recordNypsiCatBotMessage(message: Message) {
  if (message.guildId !== Constants.NYPSI_SERVER_ID || message.author.id !== CAT_BOT_ID) return;

  await redis.set(
    getCatResponseKey(message.channelId),
    message.createdTimestamp,
    "EX",
    CAT_RESPONSE_TTL_SECONDS,
  );
}

export async function isChatSpamExempt(message: Message) {
  if (gameMessages.has(message)) return true;
  if (message.content.trim().toLowerCase() !== "cat") return false;

  const catBotMessageAt = Number(await redis.get(getCatResponseKey(message.channelId)));

  return (
    catBotMessageAt <= message.createdTimestamp &&
    message.createdTimestamp - catBotMessageAt <= CAT_RESPONSE_WINDOW_MS
  );
}
