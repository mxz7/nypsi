import { Message, PartialMessage } from "discord.js";
import { getFromMessageCache, snipe } from "../utils/functions/guilds/messages";

export default async function messageDelete(message: Message | PartialMessage) {
  if (!message) return;

  const cachedMessage = getFromMessageCache(message.channelId, message.id);

  if (!cachedMessage) return;

  // new object to prevent cache cleaning it up
  snipe.set(message.channelId, {
    id: message.id,
    content: cachedMessage.content,
    channelId: message.channelId,
    createdAt: cachedMessage.createdAt,
    user: {
      avatar: cachedMessage.user.avatar,
      username: cachedMessage.user.username,
    },
  });
}
