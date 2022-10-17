import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { uploadSlashCommands, uploadSlashCommandsToGuild } from "../utils/commandhandler";
import Constants from "../utils/Constants";

const cmd = new Command("reloadslash", "reload data for slash commands", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  if (args.length == 0) {
    await uploadSlashCommandsToGuild(message.guild.id, message.client.user.id);

    if (!(message instanceof Message)) return;

    return await message.react("✅");
  } else if (args[0].toLowerCase() == "global") {
    await uploadSlashCommands(message.client.user.id);

    if (!(message instanceof Message)) return;

    return await message.react("✅");
  }
}

cmd.setRun(run);

module.exports = cmd;
