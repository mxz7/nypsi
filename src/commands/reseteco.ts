import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { reset } from "../utils/functions/economy/utils";

const cmd = new Command("reseteco", "reset economy except prestige and karma", Categories.NONE);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.author.id != Constants.TEKOH_ID) return;

  const embed = new CustomEmbed(message.member, "run that command again");

  await message.channel.send({ embeds: [embed] });

  const filter = (msg: Message) => message.author.id == msg.author.id;

  let response: any = await message.channel.awaitMessages({
    filter,
    max: 1,
  });

  response = response.first().content;

  if (response != "$reseteco") {
    return message.channel.send({ embeds: [new ErrorEmbed("captcha failed")] });
  } else {
    const c = await reset();

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `${c} users reset`)],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
