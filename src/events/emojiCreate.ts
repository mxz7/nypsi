import { GuildEmoji } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { isLogsEnabled } from "../utils/functions/moderation/logs";

export default async function emojiCreate(emoji: GuildEmoji) {
  if (await isLogsEnabled(emoji.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    const creator =
      (await emoji
        .fetchAuthor()
        .then((res) => res.id)
        .catch(() => {})) || "unknown";

    embed.setHeader("emoji created");
    embed.setDescription(`\`${emoji.name}\` - \`${emoji.id}\`\ncreated by \`${creator}\``);
    embed.setImage(emoji.url);
  }
}
