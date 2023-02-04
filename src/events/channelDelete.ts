import { GuildChannel } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";

export default async function channelDelete(channel: GuildChannel) {
  if (!channel.guild) return;

  if (await isLogsEnabled(channel.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setTitle("channel deleted");
    embed.setDescription(
      `${channel.toString()} \`${channel.id}\`\n\n**name** ${channel.name}\n**category** ${channel.parent.name}\n**type** ${
        channel.type
      }`
    );

    await addLog(channel.guild, "channel", embed);
  }
}
