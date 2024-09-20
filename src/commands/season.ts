import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";

const cmd = new Command("season", "view current season", "money");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  return message.channel.send({
    embeds: [
      new CustomEmbed(
        message.member,
        `currently on season ${Constants.SEASON_NUMBER}\n\nstarted on <t:${Math.floor(
          Constants.SEASON_START.getTime() / 1000,
        )}>`,
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
