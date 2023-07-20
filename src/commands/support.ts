import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";

const cmd = new Command("support", "join the nypsi support server", "info").setAliases(["discord"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.guildId == Constants.NYPSI_SERVER_ID) return message.channel.send({ embeds: [new ErrorEmbed(`this is the support server dumbass`)] });
  return message.channel.send({ content: "discord.gg/hJTDNST" });
}

cmd.setRun(run);

module.exports = cmd;
