import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import { toggleLock } from "../utils/functions/captcha";

const cmd = new Command("captchatest", "test an account", "none");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!Constants.ADMIN_IDS.includes(message.author.id)) return;

  if (args.length == 0) {
    return message.channel.send({ content: "dumbass" });
  }

  for (const user of args) {
    toggleLock(user, true);
  }

  if (!(message instanceof Message)) return;

  message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
