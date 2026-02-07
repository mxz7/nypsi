import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { readdir } from "fs/promises";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { ItemUse } from "../models/ItemUse";
import { addBakeryUpgrade, getBakeryUpgrades } from "../utils/functions/economy/bakery";
import { addBooster, getBoosters, getBoostersDisplay } from "../utils/functions/economy/boosters";
import { addFarm, getFarm } from "../utils/functions/economy/farm";
import {
  getInventory,
  removeInventoryItem,
  selectItem,
} from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import {
  createUser,
  formatNumber,
  getBakeryUpgradesData,
  getBaseUpgrades,
  getBaseWorkers,
  getItems,
  getTagsData,
  userExists,
} from "../utils/functions/economy/utils";
import { addWorkerUpgrade, getWorkers } from "../utils/functions/economy/workers";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import { pluralize } from "../utils/functions/string";
import { addTag, getTags } from "../utils/functions/users/tags";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const itemFunctions = new Map<string, ItemUse>();

const cmd = new Command("use", "use an item or open crates", "money").setAliases([
  "open",
  "activate",
  "eat",
  "cuddle",
  "drink",
  "dink",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option
      .setName("item")
      .setDescription("the item you want to use")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((option) =>
    option.setName("amount").setDescription("amount of item you want to use"),
  )
  .addUserOption((option) =>
    option.setName("member").setDescription("member to use your item on, if applicable"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `${prefix}use <item>\n\nuse items to open crates or to simply use the item's function`,
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

  if (!inventory.has(selected.id)) {
    return send({ embeds: [new ErrorEmbed(`you dont have ${selected.article} ${selected.name}`)] });
  }

  if (selected.role == "car") {
    return send({
      embeds: [new ErrorEmbed(`cars are used for street races (${prefix}sr)`)],
    });
  }

  await addCooldown(cmd.name, message.member, 2);

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

    if (args[1]?.toLowerCase() === "all") amount = Math.max(inventory.count(selected.id), 1);

    if (boosters.has(selected.id)) {
      if (selected.stackable) {
        if (selected.max <= boosters.get(selected.id).length) {
          return send({
            embeds: [
              new ErrorEmbed(`**${selected.name}** can only be stacked ${selected.max} times`),
            ],
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

    if (inventory.count(selected.id) < amount)
      return send({ embeds: [new ErrorEmbed(`you don't have ${amount}x ${selected.name}`)] });

    const global = Boolean(selected.boosterEffect.global);

    await Promise.all([
      addBooster(message.member, selected.id, amount, undefined, global ? "global" : "user"),
      addStat(message.member, selected.id, amount),
      removeInventoryItem(message.member, selected.id, amount),
    ]);

    boosters = await getBoosters(message.member);

    const embed = new CustomEmbed(message.member).setHeader("boosters", message.author.avatarURL());

    let desc = `activating ${amount > 1 ? `${amount}x ` : ""}**${selected.name}** booster...`;
    let desc2 = `you have activated ${amount > 1 ? `${amount}x ` : ""}**${selected.name}**${global ? " (global)" : ""}`;

    if (["cake", "cookie", "lucky_cheese"].includes(selected.id)) {
      addTaskProgress(message.author.id, "eat_cookies", amount);
      desc = `eating ${amount > 1 ? `${amount} ` : ""}**${pluralize(selected, amount)}**...`;
      desc2 = `you have eaten ${amount > 1 ? `${amount} ` : "a "}**${pluralize(
        selected,
        amount,
      )}** 😋`;
    }

    embed.setDescription(desc);

    const msg = await send({ embeds: [embed] });

    const pages = await getBoostersDisplay(boosters, embed);

    embed.setDescription(desc2);
    if (pages.get(1)) {
      embed.addField("current boosters", pages.get(1).join("\n"));
    }

    setTimeout(async () => {
      if (pages.size <= 1) return msg.edit({ embeds: [embed] });

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("⬅")
          .setLabel("back")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
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
    const userUpgrade = userWorkers
      .find((w) => upgrade.for == w.workerId)
      ?.upgrades.find((u) => u.upgradeId == upgrade.id);

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
      if (args[1]?.toLowerCase() === "all") {
        amount = Math.max(inventory.count(selected.id), 1);
        if (amount > upgrade.stack_limit) amount = upgrade.stack_limit;
        if (userUpgrade && userUpgrade.amount + amount > upgrade.stack_limit)
          amount = upgrade.stack_limit - userUpgrade.amount;
      } else {
        amount = formatNumber(args[1]);
      }

      if (amount) {
        allowed =
          (!userUpgrade && amount <= upgrade.stack_limit) ||
          (userUpgrade && userUpgrade.amount + amount <= upgrade.stack_limit);
      }
    }

    if (!allowed) {
      return send({ embeds: [new ErrorEmbed("you cannot use this many upgrades")] });
    }

    if (inventory.count(selected.id) < amount)
      return send({ embeds: [new ErrorEmbed(`you don't have this many ${selected.name}`)] });

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    for (let i = 0; i < amount; i++) {
      await addWorkerUpgrade(message.member, upgrade.for, upgrade.id);
    }

    await removeInventoryItem(message.member, selected.id, amount);
    await addStat(message.member, selected.id, amount);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have activated ${amount} **${pluralize(
            upgrade,
            amount,
          )}** on your **${getBaseWorkers()[upgrade.for].name}**\n\n${
            userUpgrade ? userUpgrade.amount + amount : amount
          }/${upgrade.stack_limit}`,
        ).setHeader("use", message.author.avatarURL()),
      ],
    });
  } else if (selected.role == "crate") {
    return itemFunctions.get("crates").run(message, args);
  } else if (selected.role == "scratch-card") {
    return itemFunctions.get("scratch_card").run(message, args);
  } else if (selected.role === "bakery-upgrade") {
    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = Math.max(inventory.count(selected.id), 1);
    } else if (args[1]) {
      amount = formatNumber(args[1]);
    }

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count(selected.id) < amount)
      return send({ embeds: [new ErrorEmbed(`you don't have this many ${selected.name}`)] });

    const bakeryUpgrades = await getBakeryUpgrades(message.member);
    const maxUses = getBakeryUpgradesData()[selected.id].max;

    if (maxUses) {
      const current = bakeryUpgrades.find((i) => i.upgradeId === selected.id)?.amount || 0;

      if (current >= maxUses) {
        return send({
          embeds: [new ErrorEmbed(`you have already used the maximum amount of this item`)],
        });
      }

      if (current + amount > maxUses) amount = maxUses - current;
    }

    await removeInventoryItem(message.member, selected.id, amount);
    await addBakeryUpgrade(message.member, selected.id, amount);

    addStat(message.member, selected.id, amount);

    const upgrades = await getBakeryUpgrades(message.member);

    const embed = new CustomEmbed(
      message.member,
      `you have activated ${amount} ${items[selected.id].emoji} ${items[selected.id].name} ${pluralize("upgrade", amount)} on your bakery`,
    ).setHeader("use", message.author.avatarURL());

    embed.addField(
      "upgrades",
      upgrades
        .map(
          (u) =>
            `\`${u.amount.toLocaleString()}${getBakeryUpgradesData()[u.upgradeId].max ? `/${getBakeryUpgradesData()[u.upgradeId].max}` : "x"}\` ${getBakeryUpgradesData()[u.upgradeId].emoji} ${
              getBakeryUpgradesData()[u.upgradeId].name
            }`,
        )
        .join("\n"),
    );

    return send({ embeds: [embed] });
  } else if (selected.role === "tag") {
    const tags = await getTags(message.member);

    if (tags.find((i) => i.tagId === selected.tagId))
      return send({ embeds: [new ErrorEmbed("you already have this tag")] });

    await removeInventoryItem(message.member, selected.id, 1);

    await addTag(message.member, selected.tagId);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you can now use the ${getTagsData()[selected.tagId].emoji} \`${
            getTagsData()[selected.tagId].name
          }\` tag`,
        ),
      ],
    });
  }
  if (selected.role === "seed") {
    let amount = 1;

    if (args[1]?.toLowerCase() === "all") {
      amount = Math.max(inventory.count(selected.id), 1);
    } else if (args[1]) {
      amount = formatNumber(args[1]);
    }

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count(selected.id) < amount)
      return send({ embeds: [new ErrorEmbed(`you don't have this many ${selected.name}`)] });

    await removeInventoryItem(message.member, selected.id, amount);
    await addFarm(message.member, selected.plantId, amount);

    const farm = await getFarm(message.member);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you've planted ${amount} ${pluralize(selected, amount)} in your farm` +
            (farm.length === amount
              ? "\n\nif you're new to farming, it's recommended you read the [farm care guide](https://nypsi.xyz/docs/economy/farm?ref=bot-help#caring-for-your-farm) to make sure you don't kill your plants"
              : ""),
        ),
      ],
    });
  } else {
    if (itemFunctions.has(selected.id)) {
      return itemFunctions.get(selected.id).run(message, args);
    } else {
      return send({
        embeds: [new CustomEmbed(message.member, "unfortunately you can't use this item.")],
      });
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

(async () => {
  const files = await readdir("./dist/utils/functions/economy/items").then((res) =>
    res.filter((file) => file.endsWith(".js")),
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
