import { GuildEmoji } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";

export default async function emojiDelete(emoji: GuildEmoji) {
  if (await isLogsEnabled(emoji.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader("emoji deleted");
    embed.setDescription(`\`${emoji.name}\` - \`${emoji.id}\``);
    embed.setImage(emoji.url);

    addLog(emoji.guild, "emoji", embed);
  }
}
