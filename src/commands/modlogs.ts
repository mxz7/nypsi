import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";

const cmd = new Command("modlogs", "moved to /settings server modlogs", "admin").setPermissions([
  "MANAGE_SERVER",
]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  return message.channel.send({
    embeds: [new CustomEmbed(message.member, "moved to /settings server modlogs")],
  });
}

cmd.setRun(run);

module.exports = cmd;
