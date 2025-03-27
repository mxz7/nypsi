import { GuildEmoji } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";

export default async function emojiUpdate(oldEmoji: GuildEmoji, newEmoji: GuildEmoji) {
  if (oldEmoji.name != newEmoji.name && (await isLogsEnabled(newEmoji.guild))) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader("emoji updated");
    embed.setDescription(
      `\`${newEmoji.name}\` - \`${newEmoji.id}\`\n${oldEmoji.name} -> ${newEmoji.name}`,
    );
    embed.setImage(newEmoji.url);

    addLog(newEmoji.guild, "emoji", embed);
  }
}
