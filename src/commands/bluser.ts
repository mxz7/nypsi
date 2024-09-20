import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { getAdminLevel } from "../utils/functions/users/admin";
import { isUserBlacklisted, setUserBlacklist } from "../utils/functions/users/blacklist";

const cmd = new Command("bluser", "blacklist account from nypsi", "none").setPermissions([
  "bot owner",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.author.id)) < 3) return;

  if (args.length === 0)
    return message.channel.send({ content: "are you stupid or some shit lol lol ol ol ol ol" });

  if (await isUserBlacklisted(args[0])) {
    await setUserBlacklist(args[0], false);
  } else {
    await setUserBlacklist(args[0], true);
  }

  return await (message as Message).react("✅");
}

cmd.setRun(run);

module.exports = cmd;
