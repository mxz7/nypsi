import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("invite", "generate an invite link for the bot", "info").setAliases(["bot"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const embed = new CustomEmbed(
    message.member,
    "bot invite: [invite.nypsi.xyz](http://invite.nypsi.xyz)\nsupport server: https://discord.gg/hJTDNST"
  )
    .setHeader("nypsi")
    .setFooter({ text: "made by max#0777 | tekoh.net" });

  message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
