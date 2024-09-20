import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("roll", "roll a dice", "utility");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  let range = 6;

  if (args.length != 0) {
    if (parseInt(args[0])) {
      if (parseInt(args[0]) < 2 || parseInt(args[0]) > 1000000000) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid range")] });
      } else {
        range = parseInt(args[0]);
      }
    }
  }

  return message.channel.send({
    embeds: [
      new CustomEmbed(
        message.member,
        "🎲 you rolled `" + (Math.floor(Math.random() * range) + 1).toLocaleString() + "`",
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;
