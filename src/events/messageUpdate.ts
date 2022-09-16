import { Message, PermissionFlagsBits } from "discord.js";
import { createGuild, eSnipe, getChatFilter, getSnipeFilter, hasGuild } from "../utils/functions/guilds/utils";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { LogType, PunishmentType } from "../utils/models/GuildStorage";
import { addLog, addModLog, isLogsEnabled } from "../utils/moderation/utils";

export default async function messageUpdate(message: Message, newMessage: Message) {
  if (!message) return;

  if (!message.member) return;

  if ((await isLogsEnabled(message.guild)) && !message.author.bot) {
    if (message.content != newMessage.content) {
      const embed = new CustomEmbed().disableFooter().setTimestamp();

      embed.setHeader("message updated");
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
    const filter = await getChatFilter(message.guild);

    let content: string | string[] = newMessage.content.toLowerCase().normalize("NFD");

    content = content.replace(/[^A-z0-9\s]/g, "");

    content = content.split(" ");

    for (const word of filter) {
      if (content.indexOf(word.toLowerCase()) != -1) {
        addModLog(message.guild, PunishmentType.FILTER_VIOLATION, message.author.id, "nypsi", content.join(" "), -1);
        return await message.delete().catch(() => {});
      }
    }
  }

  if (message.content != "" && !message.member.user.bot && message.content.length > 1) {
    if (!(await hasGuild(message.guild))) await createGuild(message.guild);

    const filter = await getSnipeFilter(message.guild);

    let content = message.content.toLowerCase().normalize("NFD");

    content = content.replace(/[^A-z0-9\s]/g, "");

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
