import { CommandInteraction, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { deleteSlashCommands } from "../utils/functions/slash-commands";
import { logger } from "../utils/logger";
import { getRest } from "../utils/rest";

const cmd = new Command("deleteslash", "delete slash commands", "none").setPermissions([
  "bot owner",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (message.author.id != Constants.OWNER_ID) return;

  const global = args[0]?.toLowerCase() === "global";

  if (args.length > 1 || (args.length === 1 && !global && args[0].toLowerCase() !== "guild")) {
    return send({ embeds: [new ErrorEmbed("deleteslash [global|guild]")] });
  }

  const applicationId = message.client.user.id;
  const guildId = global ? undefined : message.guild.id;
  const scope = global ? "global" : `guild ${guildId}`;

  try {
    await deleteSlashCommands(getRest(message.client as NypsiClient), applicationId, guildId);
    logger.info(`slash commands: deleted ${scope} commands`, { applicationId, guildId });

    if (message instanceof Message) return await message.react("✅");
  } catch (error) {
    logger.error(`slash commands: failed to delete ${scope} commands`, {
      applicationId,
      guildId,
      error,
    });

    return send({ embeds: [new ErrorEmbed(`${scope}: failed to delete slash commands`)] });
  }
}

cmd.setRun(run);

module.exports = cmd;
