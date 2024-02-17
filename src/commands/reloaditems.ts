import { CommandInteraction, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import { loadItems } from "../utils/functions/economy/utils";

const cmd = new Command("reloaditems", "reload items", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.author.id != Constants.TEKOH_ID) return;

  loadItems();
  (message.client as NypsiClient).cluster.send("reload_items");

  return (message as Message).react("✅");
}

cmd.setRun(run);

module.exports = cmd;
