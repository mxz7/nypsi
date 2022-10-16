import { CommandInteraction, Message } from "discord.js";
import Constants from "../utils/Constants";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import searchLogs from "../utils/workers/logsearch";

const cmd = new Command("logsearch", "search through logs", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  if (args.length == 0) return;

  const res = await searchLogs(args.join(" "));

  if (!res) {
    if (!(message instanceof Message)) return;
    return message.react("❌");
  }

  return message.channel.send({
    content: `results for \`${args.join(" ")}\``,
    files: [{ name: "search_results.txt", attachment: Buffer.from(res) }],
  });
}

cmd.setRun(run);

module.exports = cmd;
