import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { readdir } from "fs/promises";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { ItemUse } from "../models/ItemUse";
import { addBakeryUpgrade, getBakeryUpgrades } from "../utils/functions/economy/bakery";
import { addBooster, getBoosters } from "../utils/functions/economy/boosters";
import { getInventory, selectItem, setInventoryItem } from "../utils/functions/economy/inventory";
import { addItemUse } from "../utils/functions/economy/stats";
import {
  createUser,
  formatNumber,
  getBakeryUpgradesData,
  getBaseUpgrades,
  getBaseWorkers,
  getItems,
  userExists,
} from "../utils/functions/economy/utils";
import { addWorkerUpgrade, getWorkers } from "../utils/functions/economy/workers";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const itemFunctions = new Map<string, ItemUse>();

const cmd = new Command("use", "use an item or open crates", "money").setAliases(["open", "activate", "eat", "cuddle"]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option.setName("item").setDescription("the item you want to use").setRequired(true).setAutocomplete(true)
  )
  .addStringOption((option) => option.setName("amount").setDescription("amount of item you want to use"))
  .addUserOption((option) => option.setName("member").setDescription("member to use your item on, if applicable"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  let cooldownLength = 7;

  if (selected.role == "booster") {
    cooldownLength = 3;
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
    let amount = parseInt(args[1]) || 1;

    if (boosters.has(selected.id)) {
      if (selected.stackable) {
        if (selected.max <= boosters.get(selected.id).length) {
          return send({
            embeds: [new ErrorEmbed(`**${selected.name}** can only be stacked ${selected.max} times`)],
          });
        }
        if (amount > selected.max - boosters.get(selected.id).length) {
          amount = selected.max - boosters.get(selected.id).length;
        }
      } else {
        return send({ embeds: [new ErrorEmbed(`**${selected.name}** cannot be stacked`)] });
      }
    }

    if (amount > selected.max) amount = selected.max;
    if (!selected.stackable) amount = 1;

    if (amount <= 0)
      return send({
        embeds: [new ErrorEmbed(`**${selected.name}** can only be stacked ${selected.max} times`)],
      });

    if (!inventory.find((i) => i.item === selected.id) || inventory.find((i) => i.item == selected.id)?.amount < amount)
      return send({ embeds: [new ErrorEmbed(`you don't have ${amount}x ${selected.name}`)] });

    await Promise.all([
      addBooster(message.member, selected.id, amount),
      addItemUse(message.member, selected.id, amount),
      setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - amount, false),
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

    let desc = `activating ${amount > 1 ? `${amount}x ` : ""}**${selected.name}** booster...`;
    let desc2 = `you have activated ${amount > 1 ? `${amount}x ` : ""}**${selected.name}**`;

    if (["cake", "cookie"].includes(selected.id)) {
      desc = `eating ${amount > 1 ? `${amount} ` : ""}**${
        amount > 1 ? selected.plural || selected.name : selected.name
      }**...`;
      desc2 = `you have ate ${amount > 1 ? `${amount} ` : "a "}**${
        amount > 1 ? selected.plural || selected.name : selected.name
      }** 😋`;
    }

    embed.setDescription(desc);

    const msg = await send({ embeds: [embed] });

    const pages = PageManager.createPages(currentBoosters, 10);

    embed.setDescription(desc2);
    embed.addField("current boosters", pages.get(1).join("\n"));

    setTimeout(async () => {
      if (pages.size <= 1) return msg.edit({ embeds: [embed] });

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
      );

      await msg.edit({ embeds: [embed], components: [row] });

      const manager = new PageManager({
        embed,
        message: msg,
        row,
        userId: message.author.id,
        pages,
        updateEmbed(page: string[], embed: CustomEmbed) {
          embed.data.fields.length = 0;
          embed.addField("current boosters", page.join("\n"));
          return embed;
        },
        onPageUpdate(manager) {
          manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
          return manager.embed;
        },
      });

      return manager.listen();
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
    let amount = 1;

    if (!userUpgrade) allowed = true;

    if (userUpgrade && userUpgrade.amount < upgrade.stack_limit) allowed = true;

    if (!allowed) {
      return send({ embeds: [new ErrorEmbed("you have reached the limit for this upgrade")] });
    }

    if (args[1]) {
      amount = formatNumber(args[1]);

      if (amount) {
        if (userUpgrade && userUpgrade.amount + amount <= upgrade.stack_limit) {
          allowed = true;
        } else {
          allowed = false;
        }
      }
    }

    if (!allowed) {
      return send({ embeds: [new ErrorEmbed("you cannot use this many upgrades")] });
    }

    if (inventory.find((i) => i.item === selected.id).amount < amount)
      return send({ embeds: [new ErrorEmbed(`you don't have this many ${selected.name}`)] });

    if (!amount || isNaN(amount) || amount < 1) return send({ embeds: [new ErrorEmbed("invalid amount")] });

    for (let i = 0; i < amount; i++) {
      await addWorkerUpgrade(message.member, upgrade.for, upgrade.id);
    }

    await setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - amount, false);
    await addItemUse(message.member, selected.id, amount);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have activated **${upgrade.name}** on your **${getBaseWorkers()[upgrade.for].name}**\n\n${
            userUpgrade ? userUpgrade.amount + amount : amount
          }/${upgrade.stack_limit}`
        ).setHeader("use", message.author.avatarURL()),
      ],
    });
  } else if (selected.role == "crate") {
    return itemFunctions.get("crates").run(message, args);
  } else if (selected.role == "scratch-card") {
    return itemFunctions.get("scratch_card").run(message, args);
  } else if (selected.role === "bakery-upgrade") {
    let amount = 1;

    if (args[1]) {
      amount = formatNumber(args[1]);
    }

    if (!amount || isNaN(amount) || amount < 1) return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.find((i) => i.item === selected.id).amount < amount)
      return send({ embeds: [new ErrorEmbed(`you don't have this many ${selected.name}`)] });

    for (let i = 0; i < amount; i++) {
      await addBakeryUpgrade(message.member, selected.id);
    }
    setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - amount, false);
    addItemUse(message.member, selected.id, amount);

    const upgrades = await getBakeryUpgrades(message.member);

    const embed = new CustomEmbed(
      message.member,
      `you have activated the ${items[selected.id].emoji} ${items[selected.id].name} upgrade on your bakery`
    ).setHeader("use", message.author.avatarURL());

    embed.addField(
      "upgrades",
      upgrades
        .map(
          (u) =>
            `\`${u.amount.toLocaleString()}x\` ${getBakeryUpgradesData()[u.upgradeId].emoji} ${
              getBakeryUpgradesData()[u.upgradeId].name
            }`
        )
        .join("\n")
    );

    return send({ embeds: [embed] });
  } else {
    if (itemFunctions.has(selected.id)) {
      await addItemUse(message.member, selected.id);
      return itemFunctions.get(selected.id).run(message, args);
    } else {
      return send({ embeds: [new CustomEmbed(message.member, "unfortunately you can't use this item.")] });
    }
  }
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
