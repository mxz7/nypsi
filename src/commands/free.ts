import { CommandInteraction, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import { addBalance } from "../utils/functions/economy/balance";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import ms = require("ms");

const cmd = new Command("free", "get some free stuff", "money").setAliases([
  "poor",
  "imbroke",
  "freemoney",
]);

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  await addCooldown(cmd.name, message.member, ms("30 minutes") / 1000);

  const amount = 10_000;
  const pickaxes = Math.floor(Math.random() * 9) + 1;
  const fishingRods = Math.floor(Math.random() * 9) + 1;
  const guns = Math.floor(Math.random() * 9) + 1;

  await addBalance(message.member, amount);
  await addInventoryItem(message.member, "wooden_pickaxe", pickaxes);
  await addInventoryItem(message.member, "terrible_fishing_rod", fishingRods);
  await addInventoryItem(message.member, "terrible_gun", guns);
  addStat(message.member, "earned-freemoney", amount);

  const items = getItems();

  const desc = [
    `- $**${amount.toLocaleString()}**`,
    `- \`${pickaxes}x\` ${items["wooden_pickaxe"].emoji} ${items["wooden_pickaxe"].name}`,
    `- \`${fishingRods}x\` ${items["terrible_fishing_rod"].emoji} ${items["terrible_fishing_rod"].name}`,
    `- \`${guns}x\` ${items["terrible_gun"].emoji} ${items["terrible_gun"].name}`,
  ];

  const embed = new CustomEmbed(message.member, desc.join("\n")).setHeader(
    "free",
    message.author.avatarURL(),
  );

  send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
