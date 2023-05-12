import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { loadItems } from "../utils/functions/economy/utils";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("reloaditems", "reload items", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if ((await getAdminLevel(message.author.id)) < 69) return;

  loadItems();

  return (message as Message).react("✅");
}

cmd.setRun(run);

module.exports = cmd;
