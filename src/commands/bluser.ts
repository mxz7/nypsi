import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import { isUserBlacklisted, setUserBlacklist } from "../utils/functions/users/blacklist";

const cmd = new Command("bluser", "blacklist account from nypsi", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.author.id !== Constants.TEKOH_ID) return;

  if (args.length === 0) return message.channel.send({ content: "are you stupid or some shit lol lol ol ol ol ol " });

  if (await isUserBlacklisted(args[0])) {
    await setUserBlacklist(args[0], false);
  } else {
    await setUserBlacklist(args[0], true);
  }

  return await (message as Message).react("✅");
}

cmd.setRun(run);

module.exports = cmd;
