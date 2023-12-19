import { Collection, Message, Snowflake, TextBasedChannel } from "discord.js";
import { CustomEmbed } from "../models/EmbedBuilders";
import { addLog, isLogsEnabled } from "../utils/functions/moderation/logs";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");

export default async function messageDeleteBulk(
  messages: Collection<Snowflake, Message>,
  channel: TextBasedChannel,
) {
  if (channel.isDMBased()) return;

  if (await isLogsEnabled(channel.guild)) {
    logger.debug("logs enabled");
    const embed = new CustomEmbed().disableFooter().setTimestamp();

    embed.setTitle(`${messages.size} messages deleted in #${channel.name} [bulk delete]`);

    const desc: string[] = [];

    messages.each((message) => {
      if (message.content) {
        desc.push(
          `[${dayjs(message.createdTimestamp).format("YYYY-MM-DD HH:mm:ss")}] ${
            message.author.username
          }: ${message.content}`,
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

    logger.debug(`formatted`);

    await addLog(channel.guild, "message", embed);
    logger.debug("added logs");
  }
}
