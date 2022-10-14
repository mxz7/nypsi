import { CommandInteraction, Message } from "discord.js";
import Constants from "../utils/Constants";
import { loadItems } from "../utils/functions/economy/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";

const cmd = new Command("reloaditems", "reload items", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  loadItems();

  return (message as Message).react("✅");
}

cmd.setRun(run);

module.exports = cmd;
