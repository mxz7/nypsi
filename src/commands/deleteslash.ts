import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { deleteSlashCommands, deleteSlashCommandsFromGuild } from "../utils/handlers/commandhandler";
import { getAdminLevel } from "../utils/functions/users/admin";


const cmd = new Command("deleteslash", "delete slash commands", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if ((await getAdminLevel(message.author.id)) < 69) return;

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
