import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { selectItem } from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("recipe", "view the recipe for a craftable item", "money").setAliases(["howcraftthing"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option
    .setName("craft-item")
    .setDescription("item to view the recipe of")
    .setAutocomplete(true)
    .setRequired(true),
);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed("/recipe <item>")] });
  }

  const selected = selectItem(args.join(" ").toLowerCase());

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args.join(" ")}\``)] });
  }

  if (!selected.craft || selected.craft.ingrediants.length == 0) {
    return send({ embeds: [new ErrorEmbed(`that item is not craftable`)] });
  }

  await addCooldown(cmd.name, message.member, 4);

  const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name} recipe`);

  const desc: string[] = [];

  selected.craft.ingrediants.forEach((ingredient) => {
    const item = selectItem(ingredient.split(":")[0]);
    desc.push(`* ${ingredient.split(":")[1]} ${item.emoji} ${item.name}`);
  })

  embed.setDescription(desc.join("\n"));

  return send({ embeds: [embed]});
}

cmd.setRun(run);

module.exports = cmd;
