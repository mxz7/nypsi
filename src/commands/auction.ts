import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("auction", "moved to /market", "money").setAliases(["ah"]);

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        "auctions have been moved to be part of /market\nmore info: https://nypsi.xyz/docs/economy/market",
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
