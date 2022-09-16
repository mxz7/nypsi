import { userExists, updateBalance, getBalance, createUser } from "../utils/economy/utils.js";
import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { isPremium, getTier } from "../utils/premium/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("freemoney", "get $1k every 5 minutes", Categories.MONEY).setAliases(["poor", "imbroke"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  if ((await getBalance(message.member)) > 500000) {
    return message.channel.send({ embeds: [new ErrorEmbed("you're too rich for this command bro")] });
  }

  await addCooldown(cmd.name, message.member, 300);

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

  await updateBalance(message.member, (await getBalance(message.member)) + amount);

  const embed = new CustomEmbed(message.member, `+$**${amount.toLocaleString()}**`).setHeader(
    "free money",
    message.author.avatarURL()
  );

  message.channel.send({ embeds: [embed] }).then(async (msg) => {
    embed.setDescription(
      `+$**${amount.toLocaleString()}**\nnew balance: $**${(await getBalance(message.member)).toLocaleString()}**`
    );
    setTimeout(() => {
      msg.edit({ embeds: [embed] });
    }, 1000);
  });
}

cmd.setRun(run);

module.exports = cmd;
