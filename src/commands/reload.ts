import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { loadCommands, reloadCommand } from "../utils/handlers/commandhandler";
import { reloadInteractions } from "../utils/handlers/interactions";
import { logger } from "../utils/logger";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("reload", "reload commands", "none").setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(this.member)) < 3) return;

  if (args.length == 0) {
    loadCommands();
    if (message instanceof Message) {
      message.react("✅");
    }
    logger.info("commands reloaded");
  } else if (args[0] === "interactions") {
    reloadInteractions();
    if (message instanceof Message) {
      message.react("✅");
    }
  } else {
    const res = reloadCommand(args);
    if (message instanceof Message) message.react(res ? "✅" : "❌");
  }
}

cmd.setRun(run);

module.exports = cmd;
