import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";

const cmd = new Command("flip", "flip a coin", "utility");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const headTails = [
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
    "heads",
    "tails",
  ];

  const embed = new CustomEmbed(message.member);

  if (args.length == 0) {
    const answer = headTails[Math.floor(Math.random() * headTails.length)];
    embed.setDescription(`💸 you threw **${answer}**`);
  } else {
    if (!parseInt(args[0])) {
      return message.channel.send({
        embeds: [new ErrorEmbed("invalid range: must be between 2 and 1,069")],
      });
    }
    const amount = parseInt(args[0]);

    if ((amount > 1069 || amount < 2) && message.author.id != Constants.TEKOH_ID) {
      return message.channel.send({
        embeds: [new ErrorEmbed("invalid range: must be between 2 and 1,069")],
      });
    }

    if (amount > 100000000) {
      return message.channel.send({
        embeds: [new ErrorEmbed("invalid range: must be between 2 and 1,069")],
      });
    }

    if (amount == 2) {
      const answer = headTails[Math.floor(Math.random() * headTails.length)];
      embed.setDescription(`💸 you threw **${answer}**`);
    } else {
      let heads = 0;
      let tails = 0;
      for (let i = 0; i < amount; i++) {
        const answer = headTails[Math.floor(Math.random() * headTails.length)];

        if (answer == "heads") {
          heads++;
        } else {
          tails++;
        }
      }
      const headsPercent = ((heads / amount) * 100).toFixed(2);
      const tailsPercent = ((tails / amount) * 100).toFixed(2);

      embed.setDescription(
        `results:\n\n heads: **${heads.toLocaleString()}** (${headsPercent}%)\ntails: **${tails.toLocaleString()}** (${tailsPercent}%)`,
      );
    }
  }

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
