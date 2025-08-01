import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { hasAdminPermission } from "../utils/functions/users/admin";
import { loadCommands, reloadCommand } from "../utils/handlers/commandhandler";
import { reloadInteractions } from "../utils/handlers/interactions";
import { logger } from "../utils/logger";

const cmd = new Command("reload", "reload commands", "none").setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await hasAdminPermission(message.member, "reload"))) return;

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
