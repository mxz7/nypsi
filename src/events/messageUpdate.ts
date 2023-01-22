import { Message, PermissionFlagsBits } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import { checkAutoMute, checkMessageContent, getChatFilter, getSnipeFilter } from "../utils/functions/guilds/filters";
import { createGuild, eSnipe, hasGuild } from "../utils/functions/guilds/utils";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { addMuteViolation } from "../utils/functions/moderation/mute";
import { cleanString } from "../utils/functions/string";

export default async function messageUpdate(message: Message, newMessage: Message) {
  if (!message) return;

  if (!message.member) return;

  if ((await isLogsEnabled(message.guild)) && !message.author.bot) {
    if (message.content != newMessage.content) {
      const embed = new CustomEmbed().disableFooter().setTimestamp();

      embed.setHeader(message.author.tag, message.author.avatarURL());
      embed.setTitle("message updated");
      embed.setDescription(
        `[jump](${message.url})\n\n${message.member.toString()} \`${
          message.author.id
        }\`\n\n**channel** ${message.channel.toString()} \`${message.channelId}\``
      );
      embed.addField("old content", `\`\`\`${message.content}\`\`\``, true);
      embed.addField("new content", `\`\`\`${newMessage.content}\`\`\``, true);

      await addLog(message.guild, LogType.MESSAGE, embed);
    }
  }

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    const res = await checkMessageContent(newMessage);

    if (!res) {
      addMuteViolation(message.guild, message.member);
      await checkAutoMute(message);
      return;
    }
  }

  if (message.content != "" && !message.member.user.bot && message.content.length > 1) {
    if (!(await hasGuild(message.guild))) await createGuild(message.guild);

    const filter = await getSnipeFilter(message.guild);

    const content = cleanString(message.content.toLowerCase().normalize("NFD"));

    for (const word of filter) {
      if (content.includes(word.toLowerCase())) return;
    }

    const chatFilter = await getChatFilter(message.guild);

    for (const word of chatFilter) {
      if (content.includes(word.toLowerCase())) return;
    }

    eSnipe.set(message.channel.id, {
      content: message.content,
      member: message.author.tag,
      createdTimestamp: message.createdTimestamp,
      memberAvatar: message.author.avatarURL(),
      channel: {
        id: message.channel.id,
      },
    });
  }
}
