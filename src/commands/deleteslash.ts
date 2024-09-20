import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import Constants from "../utils/Constants";
import {
  deleteSlashCommands,
  deleteSlashCommandsFromGuild,
} from "../utils/handlers/commandhandler";

const cmd = new Command("deleteslash", "delete slash commands", "none").setPermissions([
  "bot owner",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (message.author.id != Constants.TEKOH_ID) return;

  if (args.length == 0) {
    await deleteSlashCommandsFromGuild(message.guild.id, message.client.user.id);

    if (!(message instanceof Message)) return;

    return await message.react("✅");
  } else if (args[0].toLowerCase() == "global") {
    await deleteSlashCommands(message.client.user.id);

    if (!(message instanceof Message)) return;

    return await message.react("✅");
  }
}

cmd.setRun(run);

module.exports = cmd;
