import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import { readdir } from "fs/promises";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { ItemUse } from "../models/ItemUse";
import { addBooster, getBoosters } from "../utils/functions/economy/boosters";
import { getInventory, openCrate, selectItem, setInventoryItem } from "../utils/functions/economy/inventory";
import { addItemUse } from "../utils/functions/economy/stats";
import { createUser, getBaseUpgrades, getBaseWorkers, getItems, userExists } from "../utils/functions/economy/utils";
import { addWorkerUpgrade, getWorkers } from "../utils/functions/economy/workers";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const itemFunctions = new Map<string, ItemUse>();

const cmd = new Command("use", "use an item or open crates", Categories.MONEY).setAliases([
  "open",
  "activate",
  "eat",
  "cuddle",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option.setName("item").setDescription("the item you want to use").setRequired(true).setAutocomplete(true)
  )
  .addUserOption((option) => option.setName("member").setDescription("member to use your item on, if applicable"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `${prefix}use <item>\n\nuse items to open crates or to simply use the item's function`
        ).setHeader("use", message.author.avatarURL()),
      ],
    });
  }

  const items = getItems();
  const inventory = await getInventory(message.member);

  const selected = selectItem(args[0].toLowerCase());

  if (!selected || typeof selected == "string") {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
  }

  if (!inventory.find((i) => i.item == selected.id) || inventory.find((i) => i.item == selected.id).amount == 0) {
    return send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] });
  }

  if (selected.role == "car") {
    return send({
      embeds: [new ErrorEmbed(`cars are used for street races (${prefix}sr)`)],
    });
  }

  let cooldownLength = 10;

  if (selected.role == "crate") {
    cooldownLength = 5;
  } else if (selected.role == "booster") {
    cooldownLength = 5;
  }

  await addCooldown(cmd.name, message.member, cooldownLength);

  if (selected.id.includes("gun")) {
    return send({
      embeds: [new ErrorEmbed(`this item is used with ${prefix}hunt`)],
    });
  } else if (selected.id.includes("fishing")) {
    return send({
      embeds: [new ErrorEmbed(`this item is used with ${prefix}fish`)],
    });
  } else if (selected.id.includes("coin")) {
    return send({ embeds: [new ErrorEmbed("you cant use a coin 🙄")] });
  } else if (selected.id.includes("pickaxe")) {
    return send({ embeds: [new ErrorEmbed(`this item is used with ${prefix}mine`)] });
  } else if (selected.id.includes("furnace")) {
    return send({ embeds: [new ErrorEmbed(`this item is used with ${prefix}smelt`)] });
  }

  if (selected.role == "booster") {
    let boosters = await getBoosters(message.member);

    if (selected.stackable) {
      if (boosters.has(selected.id)) {
        if (boosters.get(selected.id).length >= selected.max) {
          return send({
            embeds: [new ErrorEmbed(`**${selected.name}** can only be stacked ${selected.max} times`)],
          });
        }
      }
    } else {
      if (boosters.has(selected.id)) {
        return send({ embeds: [new ErrorEmbed(`**${selected.name}** cannot be stacked`)] });
      }
    }

    await Promise.all([
      setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - 1, false),
      addItemUse(message.member, selected.id),
      addBooster(message.member, selected.id),
    ]);

    boosters = await getBoosters(message.member);

    const embed = new CustomEmbed(message.member).setHeader("boosters", message.author.avatarURL());

    const currentBoosters: string[] = [];

    for (const boosterId of boosters.keys()) {
      if (boosters.get(boosterId).length == 1) {
        currentBoosters.push(
          `**${items[boosterId].name}** ${items[boosterId].emoji} - expires <t:${Math.round(
            boosters.get(boosterId)[0].expire / 1000
          )}:R>`
        );
      } else {
        let lowest = boosters.get(boosterId)[0].expire;

        for (const booster of boosters.get(boosterId)) {
          if (booster.expire < lowest) lowest = booster.expire;
        }

        currentBoosters.push(
          `**${items[boosterId].name}** ${items[boosterId].emoji} \`x${
            boosters.get(boosterId).length
          }\` - next expires <t:${Math.round(boosters.get(boosterId)[0].expire / 1000)}:R>`
        );
      }
    }

    let desc = `activating **${selected.name}** booster...`;
    let desc2 = `you have activated **${selected.name}**`;

    if (["cake", "cookie"].includes(selected.id)) {
      desc = `eating **${selected.name}**...`;
      desc2 = `you have ate a **${selected.name}** 😋`;
    }

    embed.setDescription(desc);

    const msg = await send({ embeds: [embed] });

    embed.setDescription(desc2);
    embed.addField("current boosters", currentBoosters.join("\n"));

    setTimeout(() => {
      return edit({ embeds: [embed] }, msg);
    }, 1000);
    return;
  } else if (selected.role == "worker-upgrade") {
    const baseUpgrades = getBaseUpgrades();

    const upgrade = baseUpgrades[selected.worker_upgrade_id];
    const userWorkers = await getWorkers(message.member);
    const userUpgrade = userWorkers.find((w) => upgrade.for == w.workerId)?.upgrades.find((u) => u.upgradeId == upgrade.id);

    if (!userWorkers.find((w) => upgrade.for.includes(w.workerId))) {
      return send({
        embeds: [new ErrorEmbed(`this upgrade requires you to have **${upgrade.for}**`)],
      });
    }

    let allowed = false;

    if (!userUpgrade) allowed = true;

    if (userUpgrade && userUpgrade.amount < upgrade.stack_limit) allowed = true;

    if (!allowed) {
      return send({ embeds: [new ErrorEmbed("you have reached the limit for this upgrade")] });
    }

    await Promise.all([
      setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - 1, false),
      addWorkerUpgrade(message.member, upgrade.for, upgrade.id),
    ]);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have activated **${upgrade.name}** on your **${getBaseWorkers()[upgrade.for].name}**\n\n${
            userUpgrade ? userUpgrade.amount + 1 : 1
          }/${upgrade.stack_limit}`
        ).setHeader("use", message.author.avatarURL()),
      ],
    });
  }

  const embed = new CustomEmbed(message.member).setHeader("use", message.author.avatarURL());

  let laterDescription: string;

  if (selected.role == "crate") {
    await addItemUse(message.member, selected.id);
    const itemsFound = await openCrate(message.member, selected);

    embed.setDescription(`opening ${selected.emoji} ${selected.name}...`);

    laterDescription = `opening ${selected.emoji} ${selected.name}...\n\nyou found: \n - ${itemsFound.join("\n - ")}`;
  } else {
    if (itemFunctions.has(selected.id)) {
      await addItemUse(message.member, selected.id);
      return itemFunctions.get(selected.id).run(message, args);
    } else {
      return send({ embeds: [new CustomEmbed(message.member, "unfortunately you can't use this item.")] });
    }
  }

  const msg = await send({ embeds: [embed] });

  if (!laterDescription) return;

  setTimeout(() => {
    embed.setDescription(laterDescription);
    edit({ embeds: [embed] }, msg);
  }, 2000);
}

cmd.setRun(run);

module.exports = cmd;

(async () => {
  const files = await readdir("./dist/utils/functions/economy/items").then((res) =>
    res.filter((file) => file.endsWith(".js"))
  );

  for (const file of files) {
    const x = await import(`../utils/functions/economy/items/${file}`);

    if (!(x instanceof ItemUse)) {
      logger.error(`failed to load ${file}`);
    } else {
      itemFunctions.set(x.itemId, x);
    }
  }

  logger.info(`${itemFunctions.size.toLocaleString()} item functions loaded`);
})();
