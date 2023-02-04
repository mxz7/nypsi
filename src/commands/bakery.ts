import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getBakeryUpgrades } from "../utils/functions/economy/bakery";
import { getBakeryUpgradesData } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("bakery", "view your current bakery upgrades", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const upgrades = await getBakeryUpgrades(message.member);

  const embed = new CustomEmbed(
    message.member,
    upgrades
      .map(
        (u) =>
          `\`${u.amount.toLocaleString()}x\` ${getBakeryUpgradesData()[u.upgradeId].emoji} ${
            getBakeryUpgradesData()[u.upgradeId].name
          }`
      )
      .join("\n")
  ).setHeader(
    "your bakery upgrades",

    message.author.avatarURL()
  );

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
