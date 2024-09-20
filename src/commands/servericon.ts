import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";

const cmd = new Command("servericon", "get the server icon", "info");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  return message.channel.send({
    embeds: [
      new CustomEmbed(message.member).setImage(
        message.guild.iconURL({
          size: 256,
        }),
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
