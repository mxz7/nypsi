import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { loadCommands, reloadCommand } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";

const cmd = new Command("reload", "reload commands", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  if (args.length == 0) {
    loadCommands();
    if (message instanceof Message) {
      message.react("✅");
    }
    logger.info("commands reloaded");
  } else {
    let msg;

    try {
      msg = reloadCommand(args).split("✔");
      msg = "```\n" + msg + "```";
    } catch (e) {
      return message.channel.send({ embeds: [new ErrorEmbed(`\`\`\`${e}\`\`\``)] });
    }

    const embed = new CustomEmbed(message.member, msg).setHeader("reload");

    message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
