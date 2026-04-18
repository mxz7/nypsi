import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("inrole", "get the members in a role", "utility");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  return send({ embeds: [new ErrorEmbed("moved to /role members")] });
}

cmd.setRun(run);

module.exports = cmd;
