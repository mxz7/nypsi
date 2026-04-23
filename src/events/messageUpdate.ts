import { Message, PartialMessage, PermissionFlagsBits } from "discord.js";
import { checkAutoMute, checkMessageContent } from "../utils/functions/guilds/filters";
import { eSnipe, getFromMessageCache } from "../utils/functions/guilds/messages";
import { addMuteViolation } from "../utils/functions/moderation/mute";
import { logger } from "../utils/logger";

export default async function messageUpdate(
  message: Message | PartialMessage,
  newMessage: Message | PartialMessage,
) {
  if (!message) return;

  if (newMessage.partial) {
    const fetched: false | Message = await newMessage.fetch().catch(() => false);

    if (!fetched) {
      logger.error("message update: failed to fetch partial new message");
      return;
    }

    newMessage = fetched;
  }

  if (!newMessage.member) return;

  const cachedMessage = getFromMessageCache(message.channelId, message.id);

  if (cachedMessage) {
    eSnipe.set(message.channelId, {
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

  if (!newMessage.member.permissions.has(PermissionFlagsBits.Administrator)) {
    const res = await checkMessageContent(
      message.guild,
      newMessage.content,
      true,
      newMessage as Message,
    );

    if (!res) {
      addMuteViolation(newMessage.guild, newMessage.member);
      await checkAutoMute(newMessage as Message);
      return;
    }
  }
}
