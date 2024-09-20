import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";

const cmd = new Command(
  "ethereum",
  "view the current ethereum value (reflects real life USD)",
  "money",
).setAliases(["eth"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);
  const ethereum = getItems()["ethereum"];
  const inventory = await getInventory(message.member);

  let ethereumAmount = 0;

  if (inventory.find((i) => i.item == "ethereum")) {
    ethereumAmount = inventory.find((i) => i.item == "ethereum").amount;
  }

  const embed = new CustomEmbed(
    message.member,
    `**worth** $${ethereum.sell.toLocaleString()}\n**owned** ${ethereumAmount.toLocaleString()} ($${(
      ethereumAmount * ethereum.sell
    ).toLocaleString()})`,
  )
    .setFooter({ text: "not real ethereum, although it reflects current worth in USD" })
    .setHeader("your ethereum", message.author.avatarURL());

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
