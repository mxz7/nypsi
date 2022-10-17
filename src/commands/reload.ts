import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { loadCommands, reloadCommand } from "../utils/commandhandler";
import Constants from "../utils/Constants";
import { logger } from "../utils/logger";

const cmd = new Command("reload", "reload commands", Categories.NONE).setPermissions(["bot owner"]);

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
