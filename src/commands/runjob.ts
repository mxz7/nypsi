import { CommandInteraction } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import Constants from "../utils/Constants";

const cmd = new Command("runjob", "run a job", "none").setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (message.author.id !== Constants.TEKOH_ID) return;

  if (args.length == 0) return (message.client as NypsiClient).cluster.send("reload_jobs");

  (message.client as NypsiClient).cluster.send(`trigger_job_${args.join(" ").toLowerCase()}`);
}

cmd.setRun(run);

module.exports = cmd;
