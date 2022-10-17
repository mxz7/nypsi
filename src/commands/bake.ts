import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { addProgress } from "../utils/functions/economy/achievements";
import { addInventoryItem, getInventory } from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";

const cmd = new Command(
  "bake",
  "use your furnace to bake cookies and cakes! (doesnt remove your furnace because cookies are cool)",
  Categories.MONEY
);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  const inventory = await getInventory(message.member);

  let hasFurnace = false;

  if (inventory.find((i) => i.item == "furnace") && inventory.find((i) => i.item == "furnace").amount > 0) {
    hasFurnace = true;
  }

  if (!hasFurnace) {
    return send({
      embeds: [new ErrorEmbed("you need a furnace to bake. furnaces can be found in crates or bought from the shop")],
      ephemeral: true,
    });
  }

  await addCooldown(cmd.name, message.member, 1200);

  const amount = Math.floor(Math.random() * 4) + 1;

  await addInventoryItem(message.member, "cookie", amount, false);

  const chance = Math.floor(Math.random() * 15);

  if (chance == 7) {
    await addInventoryItem(message.member, "cake", 1);
  }

  let desc = `you baked **${amount}** cookie${amount > 1 ? "s" : ""}!! 🍪`;

  if (chance == 7) {
    desc += "\n\nyou also managed to bake a cake <:nypsi_cake:1002977512630001725> good job!!";
  }

  await send({
    embeds: [
      new CustomEmbed(message.member, desc).setHeader(`${message.author.username}'s bakery`, message.author.avatarURL()),
    ],
  });

  await addProgress(message.author.id, "baker", amount);
}

cmd.setRun(run);

module.exports = cmd;
