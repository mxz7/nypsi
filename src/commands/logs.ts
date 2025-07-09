import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";

const cmd = new Command("logs", "moved to /settings server logs", "admin").setPermissions([
  "MANAGE_SERVER",
]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  return message.channel.send({
    embeds: [new CustomEmbed(message.member, "moved to /settings server logs")],
  });
}

cmd.setRun(run);

module.exports = cmd;
