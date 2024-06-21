import { CommandInteraction, Message } from "discord.js";
import { readFile } from "fs/promises";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { getAdminLevel } from "../utils/functions/users/admin";
import searchLogs from "../utils/functions/workers/logsearch";

const cmd = new Command("logsearch", "search through logs", "none").setPermissions(["bot owner"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.author.id)) < 3) return;

  if (args.length == 0) return;

  const path = await searchLogs(args.join(" "));

  if (!path) {
    if (!(message instanceof Message)) return;
    return message.react("❌");
  }

  return message.channel.send({
    content: `results for \`${args.join(" ")}\``,
    files: [{ name: "search_results.txt", attachment: await readFile(path) }],
  });
}

cmd.setRun(run);

module.exports = cmd;
