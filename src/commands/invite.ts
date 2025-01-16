import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";

const cmd = new Command("invite", "generate an invite link for the bot", "info").setAliases([
  "bot",
]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  const embed = new CustomEmbed(
    message.member,
    `bot invite: [nypsi.xyz/invite](https://nypsi.xyz/invite)\nsupport server: ${Constants.NYPSI_SERVER_INVITE_LINK}`,
  )
    .setHeader("nypsi")
    .setFooter({ text: "made by @m.axz | github.com/mxz7" });

  message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
