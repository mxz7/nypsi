import { Collection, Message, Snowflake, TextBasedChannel } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { LogType } from "../types/Moderation";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import dayjs = require("dayjs");

export default async function messageDeleteBulk(messages: Collection<Snowflake, Message>, channel: TextBasedChannel) {
  if (channel.isDMBased()) return;

  if (await isLogsEnabled(channel.guild)) {
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setTitle(`${messages.size} messages deleted in #${channel.name} [bulk delete]`);

    const desc: string[] = [];

    messages.each((message) => {
      if (message.content) {
        desc.push(
          `[${dayjs(message.createdTimestamp).format("YYYY-MM-DD HH:mm:ss")}] ${message.author.tag}: ${message.content}`
        );
      }

      if (desc.join("\n").length > 1500) {
        desc.push("...");
        return false;
      }
      return true;
    });

    desc.reverse();

    embed.setDescription(`\`\`\`${desc.join("\n")}\`\`\``);

    await addLog(channel.guild, LogType.MESSAGE, embed);
  }
}
