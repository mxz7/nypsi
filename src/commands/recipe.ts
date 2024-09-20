import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { selectItem } from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("recipe", "view the recipe for a craftable item", "money").setAliases([
  "howcraftthing",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("/recipe <item>")] });
  }

  const selected = selectItem(args.join(" ").toLowerCase());

  if (!selected) {
    return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args.join(" ")}\``)] });
  }

  if (!selected.craft || selected.craft.ingredients.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed(`that item is not craftable`)] });
  }

  await addCooldown(cmd.name, message.member, 4);

  const embed = new CustomEmbed(message.member).setHeader("recipe", message.author.avatarURL());

  const desc: string[] = [`${selected.emoji} ${selected.name}`];

  selected.craft.ingredients.forEach((ingredient) => {
    const item = selectItem(ingredient.split(":")[0]);
    desc.push(`* ${ingredient.split(":")[1]} ${item.emoji} ${item.name}`);
  });

  embed.setDescription(desc.join("\n"));

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
