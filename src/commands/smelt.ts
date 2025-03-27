import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import {
  addInventoryItem,
  getInventory,
  setInventoryItem,
} from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("smelt", "smelt your ores into ingots with coal", "money");

cmd.slashEnabled = true;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  const inventory = await getInventory(message.member);
  const items = getItems();

  let hasFurnace = false;
  let max = 64;
  let coal = 0;
  const ores = [];

  if (inventory.find((i) => i.item === "super_furnace")?.amount > 0) {
    hasFurnace = true;
    max = 640;
  } else if (
    inventory.find((i) => i.item == "furnace") &&
    inventory.find((i) => i.item == "furnace").amount > 0
  ) {
    hasFurnace = true;
    max = 64;
  }

  if (!hasFurnace) {
    return send({
      embeds: [
        new ErrorEmbed(
          "you need a furnace to smelt ore. furnaces can be found in crates or bought from the shop",
        ),
      ],
    });
  }

  for (const i of inventory) {
    if (items[i.item].role != "ore") continue;

    for (let x = 0; x < i.amount; x++) {
      if (ores.length >= max) break;
      ores.push(i.item);
    }
  }

  if (ores.length == 0) {
    return send({
      embeds: [new ErrorEmbed("you need ore to smelt. ores can be found through mining")],
    });
  }

  if (
    inventory.find((i) => i.item == "coal") &&
    inventory.find((i) => i.item == "coal").amount > 0
  ) {
    coal = inventory.find((i) => i.item == "coal").amount;

    if (coal > ores.length) coal = ores.length;
  }

  if (coal < ores.length) {
    return send({
      embeds: [new ErrorEmbed(`you don't have enough coal to smelt (${ores.length} ores)`)],
    });
  }

  await addCooldown(cmd.name, message.member, 600);

  if (max === 64) addStat(message.member, "furnace");
  else if (max === 640) addStat(message.member, "super_furnace");

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
      setInventoryItem(
        message.member,
        ore,
        inventory.find((i) => i.item == ore).amount - smelted.get(ore),
      ),
    );

    const ingot = items[ore].ingot;

    res += `\n${smelted.get(ore)} ${items[ingot].emoji} ${items[ingot].name}`;

    promises.push(addInventoryItem(message.member, ingot, smelted.get(ore)));
  }

  promises.push(
    setInventoryItem(message.member, "coal", inventory.find((i) => i.item == "coal").amount - coal),
  );
  promises.push(
    setInventoryItem(
      message.member,
      max === 64 ? "furnace" : "super_furnace",
      inventory.find((i) => i.item == (max === 64 ? "furnace" : "super_furnace")).amount - 1,
    ),
  );

  await Promise.all(promises);

  const embed = new CustomEmbed(message.member);
  embed.setHeader("furnace", message.author.avatarURL());
  embed.setDescription(
    `${max === 64 ? "<:furnace_lit:1354808468887965928>" : "<a:super_furnace:1314953706609049671>"} smelting...`,
  );

  const msg = await send({ embeds: [embed] });

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  setTimeout(() => {
    embed.setDescription(
      `${max === 64 ? "<:nypsi_furnace:959445132585869373>" : "<a:super_furnace:1314953706609049671>"} you have smelted: \n${res}`,
    );
    edit({ embeds: [embed] }, msg);
  }, 2000);
}

cmd.setRun(run);

module.exports = cmd;
