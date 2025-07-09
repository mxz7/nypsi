import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";

const cmd = new Command("prefix", "moved to /settings server prefix", "admin").setPermissions([
  "MANAGE_GUILD",
]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  return message.channel.send({
    embeds: [new CustomEmbed(message.member, "moved to /settings server prefix")],
  });
}

cmd.setRun(run);

module.exports = cmd;
