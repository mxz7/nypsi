import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import searchLogs from "../utils/functions/workers/logsearch";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("logsearch", "search through logs", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if ((await getAdminLevel(message.author.id)) < 3) return;

  if (args.length == 0) return;

  const res = await searchLogs(args.join(" "));

  if (!res[0]) {
    if (!(message instanceof Message)) return;
    return message.react("❌");
  }

  return message.channel.send({
    content: `${res[1].toLocaleString()} results for \`${args.join(" ")}\``,
    files: [{ name: "search_results.txt", attachment: Buffer.from(res[0]) }],
  });
}

cmd.setRun(run);

module.exports = cmd;
