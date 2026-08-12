import { Message } from "discord.js";

const gameMessages = new WeakSet<Message>();

export function markGameMessage(message: Message) {
  gameMessages.add(message);
}

export function isGameMessage(message: Message) {
  return gameMessages.has(message);
}
