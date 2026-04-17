import { Message, PartialMessage } from "discord.js";
import { getChatFilter, getSnipeFilter } from "../utils/functions/guilds/filters";
import { createGuild, hasGuild, snipe } from "../utils/functions/guilds/utils";
import { cleanString } from "../utils/functions/string";
import { logger } from "../utils/logger";

export default async function messageDelete(message: Message | PartialMessage) {
  if (!message) return;

  if (message.partial) {
    const fetched: false | Message = await message.fetch().catch(() => false);

    if (!fetched) {
      logger.error("message delete: failed to fetch partial message");
      return;
    }

    message = fetched;
  }

  if (!message.member) return;

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

    snipe.set(message.channel.id, {
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
