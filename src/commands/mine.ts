import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBoosters } from "../utils/functions/economy/boosters";
import { addInventoryItem, getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { addItemUse } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const veins = new Map<string, number[]>();

veins.set("cobblestone", [5, 7, 15, 25]);
veins.set("coal", [2, 4, 5, 8, 16]);
veins.set("iron_ore", [1, 3, 7]);
veins.set("gold_ore", [1, 2, 4]);
veins.set("diamond", [1, 2]);
veins.set("amethyst", [1, 2, 3]);
veins.set("netherrack", [5, 7, 15, 25]);
veins.set("gold_nugget", [2, 8, 12, 18, 28]);
veins.set("quartz", [1, 4, 6, 12]);

const areas = ["cave", "mineshaft", "strip mine", "1x1 hole you dug", "staircase to bedrock", "nether", "nether", "nether"];

const cmd = new Command("mine", "go to a cave and mine", Categories.MONEY).setDocs(
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

  let pickaxe: string;

  if (inventory.find((i) => i.item == "diamond_pickaxe") && inventory.find((i) => i.item == "diamond_pickaxe").amount > 0) {
    pickaxe = "diamond_pickaxe";
  } else if (inventory.find((i) => i.item == "iron_pickaxe") && inventory.find((i) => i.item == "iron_pickaxe").amount > 0) {
    pickaxe = "iron_pickaxe";
  } else if (
    inventory.find((i) => i.item == "wooden_pickaxe") &&
    inventory.find((i) => i.item == "wooden_pickaxe").amount > 0
  ) {
    pickaxe = "wooden_pickaxe";
  }

  if (!pickaxe) {
    return send({
      embeds: [
        new ErrorEmbed("you need a pickaxe to mine\n[how do i get a pickaxe?](https://docs.nypsi.xyz/economy/minecraft)"),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 300);

  await addItemUse(message.member, pickaxe);

  const mineItems = Array.from(Object.keys(items));

  const boosters = await getBoosters(message.member);

  let times = 1;
  let multi = 0;
  let unbreakable = false;

  if (pickaxe == "iron_pickaxe") {
    times = 2;
  } else if (pickaxe == "diamond_pickaxe") {
    times = 3;
  }

  for (let i = 0; i < 20; i++) {
    mineItems.push("nothing");
  }

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].role == "booster") {
      if (items[boosterId].boosterEffect.boosts.includes("mine")) {
        let chance: number;
        switch (items[boosterId].id) {
          case "fortune":
            chance = Math.floor(Math.random() * 5);
            if (chance > 1) {
              multi += items[boosterId].boosterEffect.effect;
            }
            break;
          case "efficiency":
            chance = Math.floor(Math.random() * 5);
            if (chance > 1) {
              times += items[boosterId].boosterEffect.effect;
            }
            break;
          case "unbreaking":
            unbreakable = true;
            break;
        }
      }
    }
  }

  if (!unbreakable) {
    await setInventoryItem(message.member, pickaxe, inventory.find((i) => i.item == pickaxe).amount - 1, false);
  }

  let chosenArea: string;

  const choseArea = (): string => {
    chosenArea = areas[Math.floor(Math.random() * areas.length)];

    if (chosenArea == "nether") {
      if (
        !inventory.find((i) => i.item == "nether_portal") ||
        inventory.find((i) => i.item == "nether_portal").amount == 0
      ) {
        return choseArea();
      }
    }

    return chosenArea;
  };

  chosenArea = choseArea();

  if (chosenArea == "nether") await addItemUse(message.member, "nether_portal");

  const foundItems = [];

  let foundItemsAmount = 0;

  for (let i = 0; i < times; i++) {
    const mineItemsModified = [];

    for (const i of mineItems) {
      if (items[i]) {
        if (chosenArea == "nether") {
          if (!["netherrack", "ancient_debris", "quartz", "gold_nugget"].includes(items[i].id)) continue;
        } else {
          if (
            ![
              "cobblestone",
              "coal",
              "diamond",
              "amethyst",
              "emerald",
              "iron_ore",
              "gold_ore",
              "obsidian",
              "mineshaft_chest",
            ].includes(items[i].id)
          )
            continue;

          if (items[i].id == "mineshaft_chest" && chosenArea != "mineshaft") continue;
        }

        if (items[i].id == "ancient_debris") {
          if (pickaxe != "diamond_pickaxe") continue;

          const chance = Math.floor(Math.random() * 5);

          if (chance >= 2) continue;
        }

        if (items[i].rarity == 4) {
          const chance = Math.floor(Math.random() * 3);
          if (chance == 1 && pickaxe == "diamond_pickaxe") {
            for (let x = 0; x < 10; x++) {
              mineItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 3) {
          if (pickaxe == "wooden_pickaxe" && items[i].id != "mineshaft_chest") continue;

          if (items[i].id == "mineshaft_chest") {
            for (let x = 0; x < 3; x++) {
              mineItemsModified.push(i);
            }
          } else {
            for (let x = 0; x < 10; x++) {
              mineItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 2 && pickaxe != "wooden_pickaxe") {
          for (let x = 0; x < 15; x++) {
            mineItemsModified.push(i);
          }
        } else if (items[i].rarity == 1 && pickaxe != "wooden_pickaxe") {
          for (let x = 0; x < 20; x++) {
            mineItemsModified.push(i);
          }
        } else if (items[i].rarity == 0) {
          if (pickaxe == "diamond_pickaxe" && chosenArea != "nether") {
            for (let x = 0; x < 7; x++) {
              mineItemsModified.push(i);
            }
          } else {
            for (let x = 0; x < 50; x++) {
              mineItemsModified.push(i);
            }
          }
        }
      }
    }

    const chosen = mineItemsModified[Math.floor(Math.random() * mineItemsModified.length)];

    if (chosen == "nothing") continue;

    let amount = 1;

    if (veins.has(chosen)) {
      amount = veins.get(chosen)[Math.floor(Math.random() * veins.get(chosen).length)];

      if (multi > 0) {
        amount += amount * multi;
        amount = Math.floor(amount);
        if (amount > 64) amount = 64;
      }
    }

    await addInventoryItem(message.member, chosen, amount);

    foundItems.push(`${amount} ${items[chosen].emoji} ${items[chosen].name}`);
    foundItemsAmount += amount;
  }

  const embed = new CustomEmbed(message.member, `you go to the ${chosenArea} and swing your **${items[pickaxe].name}**`);

  const msg = await send({ embeds: [embed] });

  embed.setDescription(
    `you go to the ${chosenArea} and swing your **${items[pickaxe].name}**\n\nyou found${
      foundItems.length > 0 ? `: \n - ${foundItems.join("\n - ")}` : " **nothing**"
    }`
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

  addProgress(message.author.id, "miner", foundItemsAmount);
}

cmd.setRun(run);

module.exports = cmd;
