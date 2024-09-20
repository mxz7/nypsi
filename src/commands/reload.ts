import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import Constants from "../utils/Constants";
import { loadCommands, reloadCommand } from "../utils/handlers/commandhandler";
import { reloadInteractions } from "../utils/handlers/interactions";
import { logger } from "../utils/logger";

const cmd = new Command("reload", "reload commands", "none").setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (message.author.id != Constants.TEKOH_ID) return;

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
    reloadCommand(args);
    if (message instanceof Message) message.react("✅");
  }
}

cmd.setRun(run);

module.exports = cmd;
