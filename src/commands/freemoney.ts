import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import { addBalance, getBalance } from "../utils/functions/economy/balance";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import ms = require("ms");

const cmd = new Command("freemoney", "get some free money", "money").setAliases([
  "poor",
  "imbroke",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  await addCooldown(cmd.name, message.member, ms("30 minutes") / 1000);

  let amount = 1000;

  if (await isPremium(message.author.id)) {
    if ((await getTier(message.author.id)) == 1) {
      amount = 2500;
    } else if ((await getTier(message.author.id)) == 2) {
      amount = 5000;
    } else if ((await getTier(message.author.id)) == 3) {
      amount = 7500;
    } else if ((await getTier(message.author.id)) == 4) {
      amount = 10000;
    }
  }

  await addBalance(message.member, amount);
  addStat(message.author.id, "earned-freemoney", amount);

  const embed = new CustomEmbed(message.member, `+$**${amount.toLocaleString()}**`).setHeader(
    "free money",
    message.author.avatarURL(),
  );

  message.channel.send({ embeds: [embed] }).then(async (msg) => {
    embed.setDescription(
      `+$**${amount.toLocaleString()}**\nnew balance: $**${(
        await getBalance(message.member)
      ).toLocaleString()}**`,
    );
    setTimeout(() => {
      msg.edit({ embeds: [embed] });
    }, 1000);
  });
}

cmd.setRun(run);

module.exports = cmd;
