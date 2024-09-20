import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";

const cmd = new Command(
  "bitcoin",
  "view the current bitcoin value (reflects real life USD)",
  "money",
).setAliases(["btc"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);
  const bitcoin = getItems()["bitcoin"];
  const inventory = await getInventory(message.member);

  let bitcoinAmount = 0;

  if (inventory.find((i) => i.item == "bitcoin")) {
    bitcoinAmount = inventory.find((i) => i.item == "bitcoin").amount;
  }

  const embed = new CustomEmbed(
    message.member,
    `**worth** $${bitcoin.sell.toLocaleString()}\n**owned** ${bitcoinAmount.toLocaleString()} ($${(
      bitcoinAmount * bitcoin.sell
    ).toLocaleString()})`,
  )
    .setFooter({ text: "not real bitcoin, although it reflects current worth in USD" })
    .setHeader("your bitcoin", message.author.avatarURL());

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
