import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("rules", "view nypsi bot and server rules", "info");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  return message.channel.send({
    embeds: [
      new CustomEmbed(
        message.member,
        "rules for the **bot** and the [official nypsi discord server](https://nypsi.xyz/discord) can be found below\n\nhttps://nypsi.xyz/rules",
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
