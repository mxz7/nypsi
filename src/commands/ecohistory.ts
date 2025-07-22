import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { isPremium } from "../utils/functions/premium/premium";

const cmd = new Command(
  "ecohistory",
  "view your metric data history in a graph",
  "money",
).setAliases(["graph"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await isPremium(message.member))) {
    return message.channel.send({
      embeds: [new ErrorEmbed("this command requires premium membership. /premium")],
    });
  }

  return message.channel.send({
    embeds: [new CustomEmbed(message.member, "moved to https://nypsi.xyz/me?ref=bot-ecohistory")],
  });
}

cmd.setRun(run);

module.exports = cmd;
