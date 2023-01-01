import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBoosters } from "../utils/functions/economy/boosters";
import { addInventoryItem, getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { addItemUse } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("hunt", "go to a field and hunt", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
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

  let gun: string;

  if (inventory.find((i) => i.item == "incredible_gun") && inventory.find((i) => i.item == "incredible_gun").amount > 0) {
    gun = "incredible_gun";
  } else if (inventory.find((i) => i.item == "gun") && inventory.find((i) => i.item == "gun").amount > 0) {
    gun = "gun";
  } else if (inventory.find((i) => i.item == "terrible_gun") && inventory.find((i) => i.item == "terrible_gun").amount > 0) {
    gun = "terrible_gun";
  }

  if (!gun) {
    return send({
      embeds: [
        new ErrorEmbed("you need a gun to hunt\n[how do i get a gun?](https://docs.nypsi.xyz/economy/fishinghunting)"),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 300);

  await addItemUse(message.member, gun);

  const huntItems = Array.from(Object.keys(items));

  let times = 1;

  if (gun == "gun") {
    times = 2;
  } else if (gun == "incredible_gun") {
    times = 3;
  }

  const boosters = await getBoosters(message.member);
  let unbreaking = false;

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].boosterEffect.boosts.includes("hunt")) {
      if (items[boosterId].id == "unbreaking") {
        unbreaking = true;
      } else {
        times++;
      }
    }
  }

  if (!unbreaking) {
    await setInventoryItem(message.member, gun, inventory.find((i) => i.item == gun).amount - 1, false);
  }

  for (let i = 0; i < 15; i++) {
    huntItems.push("nothing");
  }

  const foundItems = [];
  let foundItemsAmount = 0;

  for (let i = 0; i < times; i++) {
    const huntItemsModified = [];

    for (const i of huntItems) {
      if (items[i]) {
        if (items[i].role != "prey") continue;
        if (items[i].rarity == 4) {
          const chance = Math.floor(Math.random() * 15);
          if (chance == 4 && gun == "incredible_gun") {
            for (let x = 0; x < 4; x++) {
              huntItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 3) {
          const chance = Math.floor(Math.random() * 3);
          if (chance == 2 && gun != "terrible_gun") {
            for (let x = 0; x < 4; x++) {
              huntItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 2 && gun != "terrible_gun") {
          for (let x = 0; x < 7; x++) {
            huntItemsModified.push(i);
          }
        } else if (items[i].rarity == 1) {
          for (let x = 0; x < 15; x++) {
            huntItemsModified.push(i);
          }
        } else if (items[i].rarity == 0) {
          if (gun == "incredible_gun") {
            for (let x = 0; x < 7; x++) {
              huntItemsModified.push(i);
            }
          } else {
            for (let x = 0; x < 25; x++) {
              huntItemsModified.push(i);
            }
          }
        }
      }
    }

    const chosen = huntItemsModified[Math.floor(Math.random() * huntItemsModified.length)];

    if (chosen == "nothing") continue;

    let amount = 1;

    if (gun == "terrible_gun") {
      amount = Math.floor(Math.random() * 2) + 1;
    } else if (gun == "gun") {
      amount = Math.floor(Math.random() * 4) + 1;
    } else if (gun == "incredible_gun") {
      amount = Math.floor(Math.random() * 4) + 2;
    }

    await addInventoryItem(message.member, chosen, amount);

    foundItems.push(`${amount} ${items[chosen].emoji} ${items[chosen].name}`);
    foundItemsAmount += amount;
  }

  const embed = new CustomEmbed(
    message.member,
    `you go to the ${["field", "forest"][Math.floor(Math.random() * 2)]} and prepare your **${items[gun].name}**`
  );

  const msg = await send({ embeds: [embed] });

  embed.setDescription(
    `you go to the ${["field", "forest"][Math.floor(Math.random() * 2)]} and prepare your **${
      items[gun].name
    }**\n\nyou killed${foundItems.length > 0 ? `: \n - ${foundItems.join("\n - ")}` : " **nothing**"}`
  );

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  setTimeout(() => {
    edit({ embeds: [embed] }, msg);
  }, 1500);

  addProgress(message.author.id, "hunter", foundItemsAmount);
}

cmd.setRun(run);

module.exports = cmd;
