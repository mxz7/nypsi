import { Message, PartialMessage, PermissionFlagsBits } from "discord.js";
import {
  checkAutoMute,
  checkMessageContent,
  getChatFilter,
  getSnipeFilter,
} from "../utils/functions/guilds/filters";
import { eSnipe } from "../utils/functions/guilds/messages";
import { createGuild, hasGuild } from "../utils/functions/guilds/utils";
import { addMuteViolation } from "../utils/functions/moderation/mute";
import { cleanString } from "../utils/functions/string";
import { logger } from "../utils/logger";

export default async function messageUpdate(
  message: Message | PartialMessage,
  newMessage: Message | PartialMessage,
) {
  if (!message) return;

  if (message.partial) {
    const fetched: false | Message = await message.fetch().catch(() => false);

    if (!fetched) {
      logger.error("message update: failed to fetch partial message");
      return;
    }

    message = fetched;
  }

  if (newMessage.partial) {
    const fetched: false | Message = await newMessage.fetch().catch(() => false);

    if (!fetched) {
      logger.error("message update: failed to fetch partial new message");
      return;
    }

    newMessage = fetched;
  }

  if (!message.member) return;

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

  if (message.content != "" && !message.author.bot && message.content.length > 1) {
    if (!(await hasGuild(message.guild))) await createGuild(message.guild);

    const filter = await getSnipeFilter(message.guild);

    const content = cleanString(message.content.toLowerCase().normalize("NFD"));

    for (const word of filter) {
      if (content.includes(word.toLowerCase())) return;
    }

    const chatFilter = await getChatFilter(message.guild);

    for (const word of chatFilter) {
      if (content.includes(word.content)) return;
    }

    eSnipe.set(message.channel.id, {
      content: message.content,
      member: message.author.username,
      createdTimestamp: message.createdTimestamp,
      memberAvatar: message.author.avatarURL(),
      channel: {
        id: message.channel.id,
      },
    });
  }
}
