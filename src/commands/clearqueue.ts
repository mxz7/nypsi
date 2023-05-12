import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { mentionQueue } from "../utils/functions/users/mentions";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("clearqueue", "clear the mentions queue", "none").setPermissions(["bot owner"]);

async function run(message: Message | (CommandInteraction & NypsiCommandInteraction)) {
  if ((await getAdminLevel(message.author.id)) < 69) return;

  mentionQueue.length = 0;

  if (message instanceof Message) {
    return await message.react("✅");
  }
}

cmd.setRun(run);

module.exports = cmd;
