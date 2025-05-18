import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { uploadSlashCommands, uploadSlashCommandsToGuild } from "../utils/handlers/commandhandler";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("reloadslash", "reload data for slash commands", "none").setPermissions([
  "bot owner",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.member)) < 3) return;

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
