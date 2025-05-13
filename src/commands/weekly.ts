import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { isBooster } from "../utils/functions/premium/boosters";
import { getTier, isPremium } from "../utils/functions/premium/premium.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("weekly", "get your weekly bonus (premium only)", "money");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  if (!(await userExists(message.member))) {
    await createUser(message.member);
  }

  const prefix = (await getPrefix(message.guild))[0];

  const notValidForYou = () => {
    const embed = new CustomEmbed(
      message.member,
      "you need [**premium**](https://ko-fi.com/tekoh/tiers) to get weekly rewards",
    ).setFooter({
      text: `${prefix}premium`,
    });

    return message.channel.send({ embeds: [embed] });
  };

  if (!(await isPremium(message.author.id)) && !(await isBooster(message.author.id))) {
    return notValidForYou();
  } else {
    if ((await getTier(message.author.id)) < 2 && !(await isBooster(message.author.id))) {
      return notValidForYou();
    }

    const now = new Date();
    const saturday = new Date();
    saturday.setDate(now.getDate() + ((6 - 1 - now.getDay() + 7) % 7) + 1);
    saturday.setHours(0, 10, 0, 0);

    const embed = new CustomEmbed(
      message.member,
      `you will automatically receive your weekly rewards <t:${Math.floor(saturday.getTime() / 1000)}:R>`,
    );

    return message.channel.send({ embeds: [embed] });
  }
}

function timeUntil(date: number) {
  const ms = Math.floor(date - new Date().getTime());

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const daysms = ms % (24 * 60 * 60 * 1000);
  const hours = Math.floor(daysms / (60 * 60 * 1000));
  const hoursms = ms % (60 * 60 * 1000);
  const minutes = Math.floor(hoursms / (60 * 1000));
  const minutesms = ms % (60 * 1000);
  const sec = Math.floor(minutesms / 1000);

  let output = "";

  if (days > 0) {
    output = output + days + "d ";
  }

  if (hours > 0) {
    output = output + hours + "h ";
  }

  if (minutes > 0) {
    output = output + minutes + "m ";
  }

  if (sec > 0) {
    output = output + sec + "s";
  } else if (output != "") {
    output = output.substring(0, output.length - 1);
  }

  if (output == "") {
    output = "0s";
  }

  return output;
}

cmd.setRun(run);

module.exports = cmd;
