import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";

const cmd = new Command(
  "wiki",
  "get the link to the nypsi wiki / documentation",
  "info",
).setAliases(["docs"]);

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  const embed = new CustomEmbed(
    message.member,
    "https://nypsi.xyz/docs?ref=bot-wiki\n\n" +
      "nypsi documentation / wiki is fully open source, meaning you can contribute and add to it! it may not be in the best shape right now and have all of the information, but it's always being improved and kept up to date",
  ).setHeader("nypsi documentation", message.author.avatarURL());

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
