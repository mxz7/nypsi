import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { isBooster } from "../utils/functions/premium/boosters";
import { getTier, isPremium } from "../utils/functions/premium/premium.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("weekly", "get your weekly bonus (premium only)", "money");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
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
      "you need [**premium**](https://ko-fi.com/nypsi/tiers) to get weekly rewards",
    ).setFooter({
      text: `${prefix}premium`,
    });

    return send({ embeds: [embed] });
  };

  if (!(await isPremium(message.member)) && !(await isBooster(message.member))) {
    return notValidForYou();
  } else {
    if ((await getTier(message.member)) < 2 && !(await isBooster(message.member))) {
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

    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
