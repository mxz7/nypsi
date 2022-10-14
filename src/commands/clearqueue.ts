import { CommandInteraction, Message } from "discord.js";
import Constants from "../utils/Constants";
import { mentionQueue } from "../utils/functions/users/mentions";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";

const cmd = new Command("clearqueue", "clear the mentions queue", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (CommandInteraction & NypsiCommandInteraction)) {
  if (message.author.id != Constants.TEKOH_ID) return;

  mentionQueue.length = 0;

  if (message instanceof Message) {
    return await message.react("✅");
  }
}

cmd.setRun(run);

module.exports = cmd;
