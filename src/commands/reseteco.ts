import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { reset } from "../utils/functions/economy/utils";

const cmd = new Command("reseteco", "reset economy except prestige and karma", "none");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.author.id != Constants.TEKOH_ID) return;

  const embed = new CustomEmbed(message.member, "run that command again");

  await message.channel.send({ embeds: [embed] });

  const code = Math.floor(Math.random() * 10000);
  console.log(code);

  const filter = (msg: Message) => message.author.id == msg.author.id;

  let response: any = await message.channel.awaitMessages({
    filter,
    max: 1,
  });

  response = response.first().content;

  if (response != code) {
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
