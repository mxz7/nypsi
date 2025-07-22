import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { hasAdminPermission } from "../utils/functions/users/admin";
import { uploadSlashCommands, uploadSlashCommandsToGuild } from "../utils/handlers/commandhandler";

const cmd = new Command("reloadslash", "reload data for slash commands", "none").setPermissions([
  "bot owner",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await hasAdminPermission(message.member, "reload"))) return;

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
