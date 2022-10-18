import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import { toggleLock } from "../utils/functions/captcha";

const cmd = new Command("captchatest", "test an account", Categories.NONE);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.author.id != Constants.TEKOH_ID) return;

  if (args.length == 0) {
    return message.channel.send({ content: "dumbass" });
  }

  for (const user of args) {
    toggleLock(user);
  }

  if (!(message instanceof Message)) return;

  message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
