import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("github", "view code for the bot on github", "info").setAliases(["git"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const embed = new CustomEmbed(
    message.member,
    "nypsi is open source!!\n" +
      "click [here](https://github.com/mxz7/nypsi) to view the source code on github",
  )
    .setTitle("github")
    .setURL("https://github.com/mxz7/nypsi")
    .addField(
      "what does this mean?",
      "if you know how to code, you could fix bugs, add features, create your own commands.. the list goes on.",
    );

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
