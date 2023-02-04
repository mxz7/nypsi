import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import { loadItems } from "../utils/functions/economy/utils";

const cmd = new Command("reloaditems", "reload items", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  loadItems();

  return (message as Message).react("✅");
}

cmd.setRun(run);

module.exports = cmd;
