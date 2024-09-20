import { CommandInteraction } from "discord.js";
// @ts-expect-error doesnt like getting from json file
import { workMessages } from "../../data/lists.json";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addBalance, getBalance } from "../utils/functions/economy/balance";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "work",
  "work a random job and safely earn a random amount of money",
  "money",
);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  if ((await getBalance(message.member)) <= 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("you need money to work")] });
  }

  if ((await getBalance(message.member)) > 1000000) {
    return message.channel.send({
      embeds: [new ErrorEmbed("you're too rich for this command bro")],
    });
  }

  await addCooldown(cmd.name, message.member, 1800);

  let earnedMax = 20;

  if ((await getBalance(message.member)) <= 100000) {
    earnedMax = 35;
  } else if ((await getBalance(message.member)) >= 250000) {
    earnedMax = 10;
  }

  const earnedPercent = Math.floor(Math.random() * earnedMax) + 1;
  let earned = Math.round((earnedPercent / 100) * (await getBalance(message.member)));

  if ((await getBalance(message.member)) >= 2000000) {
    const base = 25000;
    const bonus = Math.floor(Math.random() * 75000);
    const total = base + bonus;

    earned = total;
  }

  const work = workMessages[Math.floor(Math.random() * workMessages.length)];

  await addBalance(message.member, earned);
  addStat(message.author.id, "earned-work", earned);

  const embed = new CustomEmbed(message.member, work).setHeader("work", message.author.avatarURL());

  message.channel.send({ embeds: [embed] }).then(async (m) => {
    if ((await getBalance(message.member)) >= 2000000) {
      embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "**");
    } else {
      embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "**");
    }

    setTimeout(() => {
      m.edit({ embeds: [embed] });
    }, 1500);
  });
}

cmd.setRun(run);

module.exports = cmd;
