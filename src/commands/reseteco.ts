import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { reset } from "../utils/functions/economy/utils";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("reseteco", "reset economy except prestige and karma", "none");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if ((await getAdminLevel(message.author.id)) < 69) return;

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
