import { randomInt } from "crypto";
import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBoosters } from "../utils/functions/economy/boosters";
import { addInventoryItem, getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

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

  if (!(await userExists(message.member))) await createUser(message.member);

  const inventory = await getInventory(message.member);

  let hasFurnace = false;
  let hasCoal = false;

  if (inventory.find((i) => i.item == "furnace") && inventory.find((i) => i.item == "furnace").amount > 0) {
    hasFurnace = true;
  }

  if (inventory.find((i) => i.item == "coal") && inventory.find((i) => i.item == "coal").amount > 0) {
    hasCoal = true;
  }

  if (!hasFurnace) {
    return send({
      embeds: [new ErrorEmbed("you need a furnace to bake. furnaces can be found in crates or bought from the shop")],
      ephemeral: true,
    });
  }

  if (!hasCoal) {
    return send({
      embeds: [new ErrorEmbed("you need coal to bake. coal can be found when mining or bought from the shop")],
      ephemeral: true,
    });
  }

  await addCooldown(cmd.name, message.member, 1200);

  let max = 4;
  let maxCake = 1;

  const boosters = await getBoosters(message.member);

  for (const booster of boosters.keys()) {
    if (getItems()[booster].boosterEffect.boosts.includes("cookie")) {
      max += max * getItems()[booster].boosterEffect.effect * boosters.get(booster).length;
      maxCake += boosters.get(booster).length;
    }
  }

  let min = Math.floor(max / 25);
  if (min < 1) min = 1;

  const amount = randomInt(min, max);

  await setInventoryItem(message.member, "coal", inventory.find((i) => i.item == "coal").amount - 1, false);
  await addInventoryItem(message.member, "cookie", amount, false);

  const chance = Math.floor(Math.random() * 15);
  let foundCakes = 0;

  if (chance == 7) {
    foundCakes = 1;

    if (maxCake > 1) {
      foundCakes = Math.floor(Math.random() * maxCake) + 1;
    }

    await addInventoryItem(message.member, "cake", foundCakes);
  }

  let desc = `you baked **${amount}** cookie${amount > 1 ? "s" : ""}!! 🍪`;

  if (chance == 7) {
    desc += `\n\nyou also managed to bake ${foundCakes > 1 ? foundCakes : "a"} cake${
      foundCakes > 1 ? "s" : ""
    } <:nypsi_cake:1002977512630001725> good job!!`;
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
