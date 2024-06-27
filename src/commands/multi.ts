import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import { getGambleMulti, getSellMulti } from "../utils/functions/economy/balance";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("multi", "check your multipliers", "money").setAliases([
  "multis",
  "multiplier",
  "multipliers",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  if (!(await userExists(message.member))) await createUser(message.member);

  const embed = new CustomEmbed(message.member).setDescription(
    `gamble multiplier: **${Math.floor((await getGambleMulti(message.member)).multi * 100)}**%\n` +
      `sell multiplier: **${Math.floor((await getSellMulti(message.member)).multi * 100)}**%`,
  );

  embed.setHeader(`${message.author.username}`, message.author.avatarURL());

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
