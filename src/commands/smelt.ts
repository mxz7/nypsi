import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addInventoryItem, getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { addItemUse } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("smelt", "smelt your ores into ingots with coal", Categories.MONEY).setDocs(
  "https://docs.nypsi.xyz/economy/minecraft"
);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  const inventory = await getInventory(message.member);
  const items = getItems();

  let hasFurnace = false;
  let coal = 0;
  const ores = [];

  if (inventory.find((i) => i.item == "furnace") && inventory.find((i) => i.item == "furnace").amount > 0) {
    hasFurnace = true;
  }

  if (!hasFurnace) {
    return send({
      embeds: [new ErrorEmbed("you need a furnace to smelt ore. furnaces can be found in crates or bought from the shop")],
    });
  }

  if (inventory.find((i) => i.item == "iron_ore") && inventory.find((i) => i.item == "iron_ore").amount > 0) {
    for (let i = 0; i < inventory.find((i) => i.item == "iron_ore").amount; i++) {
      ores.push("iron_ore");
      if (ores.length >= 64) break;
    }
  }

  if (inventory.find((i) => i.item == "gold_ore") && inventory.find((i) => i.item == "gold_ore").amount > 0) {
    for (let i = 0; i < inventory.find((i) => i.item == "gold_ore").amount; i++) {
      ores.push("gold_ore");
      if (ores.length >= 64) break;
    }
  }

  if (ores.length == 0) {
    return send({
      embeds: [new ErrorEmbed("you need ore to smelt. ore can be found in crates and through mining")],
    });
  }

  if (inventory.find((i) => i.item == "coal") && inventory.find((i) => i.item == "coal").amount > 0) {
    coal = inventory.find((i) => i.item == "coal").amount;

    if (coal > ores.length) coal = ores.length;
  }

  if (coal == 0) {
    return send({
      embeds: [new ErrorEmbed("you need coal to smelt ore. coal can be found in crates and through mining")],
    });
  }

  await addCooldown(cmd.name, message.member, 600);

  await addItemUse(message.member, "furnace");

  const smelted = new Map<string, number>();

  for (const ore of ores) {
    if (smelted.has(ore)) {
      smelted.set(ore, smelted.get(ore) + 1);
    } else {
      smelted.set(ore, 1);
    }
  }

  let res = "";

  const promises = [];

  for (const ore of Array.from(smelted.keys())) {
    promises.push(
      setInventoryItem(message.member, ore, inventory.find((i) => i.item == ore).amount - smelted.get(ore), false)
    );

    const ingot = items[ore].ingot;

    res += `\n${smelted.get(ore)} ${items[ingot].emoji} ${items[ingot].name}`;

    promises.push(addInventoryItem(message.member, ingot, smelted.get(ore), false));
  }

  promises.push(setInventoryItem(message.member, "coal", inventory.find((i) => i.item == "coal").amount - coal, false));
  promises.push(setInventoryItem(message.member, "furnace", inventory.find((i) => i.item == "furnace").amount - 1, false));

  await Promise.all(promises);

  const embed = new CustomEmbed(message.member);
  embed.setHeader("furnace", message.author.avatarURL());
  embed.setDescription("<:nypsi_furnace_lit:959445186847584388> smelting...");

  const msg = await send({ embeds: [embed] });

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  setTimeout(() => {
    embed.setDescription(`<:nypsi_furnace:959445132585869373> you have smelted: \n${res}`);
    edit({ embeds: [embed] }, msg);
  }, 2000);
}

cmd.setRun(run);

module.exports = cmd;
