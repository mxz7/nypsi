import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { logger } from "../utils/logger";
import { loadCommands, reloadCommand } from "../utils/commandhandler";

const cmd = new Command("reload", "reload commands", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id != "672793821850894347") return;

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
