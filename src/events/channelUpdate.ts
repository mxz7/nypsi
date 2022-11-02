import { GuildChannel } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";

export default async function channelUpdate(oldChannel: GuildChannel, newChannel: GuildChannel) {
  if (oldChannel.name != newChannel.name && (await isLogsEnabled(newChannel.guild))) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setHeader("channel renamed");
    embed.setDescription(`${newChannel.toString()} \`${newChannel.id}\`\n` + `${oldChannel.name} -> ${newChannel.name}`);

    await addLog(newChannel.guild, LogType.CHANNEL, embed);
  }
}
