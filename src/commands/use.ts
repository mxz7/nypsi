import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import type { ItemUseRequest } from "../models/ItemUse";
import { addBakeryUpgrade, getBakeryUpgrades } from "../utils/functions/economy/bakery";
import { addBooster, getBoosters, getBoostersDisplay } from "../utils/functions/economy/boosters";
import { addFarm, getFarm } from "../utils/functions/economy/farm";
import {
  getInventory,
  removeInventoryItem,
  selectItem,
} from "../utils/functions/economy/inventory";
import {
  getItemUseDefinition,
  getItemUseAmountError,
  getItemUseGuidance,
  parseItemUseAmount,
  parseItemUseArguments,
} from "../utils/functions/economy/item-use";
import { addPet, getUserPet } from "../utils/functions/economy/pets";
import { addStat } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import {
  createUser,
  getBakeryUpgradesData,
  getBaseUpgrades,
  getBaseWorkers,
  getItems,
  getPetsData,
  getTagsData,
  userExists,
} from "../utils/functions/economy/utils";
import { addWorkerUpgrade, getWorkers } from "../utils/functions/economy/workers";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { pluralize } from "../utils/functions/string";
import { addTag, getTags } from "../utils/functions/users/tags";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

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
    option
      .setName("amount")
      .setDescription("quantity or all (defaults to 1; ignored for single-use items)"),
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

  const slash = !(message instanceof Message) && message.isChatInputCommand();

  if (!slash && args.length === 0) {
    const prefix = (await getPrefix(message.guild))[0];
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `${prefix}use <item> [amount or member]\n\nuse items to open crates or activate their effects`,
        ).setHeader("use", message.author.avatarURL()),
      ],
    });
  }

  const search = slash ? message.options.getString("item", true) : args.join(" ");
  const parsed = slash
    ? { item: selectItem(search.trim().toLowerCase()), rest: [] as string[] }
    : parseItemUseArguments(args);
  const selected = parsed.item;

  if (!selected) {
    return send({
      embeds: [
        new ErrorEmbed(
          `couldn't find an item matching \`${search.slice(0, 100)}\`. choose an item from your inventory`,
        ),
      ],
    });
  }

  const items = getItems();
  const inventory = await getInventory(message.member);

  if (!inventory.has(selected.id)) {
    return send({
      embeds: [new ErrorEmbed(`you don't have ${selected.article} ${selected.name}`)],
    });
  }

  const definition = await getItemUseDefinition(selected);
  if (!definition) return send({ embeds: [new ErrorEmbed(getItemUseGuidance(selected))] });

  const quantity = definition.options.amount
    ? parseItemUseAmount(slash ? message.options.getString("amount") : parsed.rest[0])
    : 1;
  const input: ItemUseRequest = {
    item: selected,
    amount: quantity === "all" ? inventory.count(selected.id) : quantity,
    all: quantity === "all",
    send,
  };

  if (definition.options.target) {
    const user = slash ? message.options.getUser("member") : undefined;
    const targetSearch = slash
      ? user?.id
      : (parsed.rest.find((word) => /^<@!?\d+>$/.test(word) || /^\d{17,20}$/.test(word)) ??
        parsed.rest.join(" "));

    if (!targetSearch) {
      return send({
        embeds: [
          new ErrorEmbed(
            `choose a member to use **${selected.name}** on. \`/use item:${selected.id} member:@user\``,
          ),
        ],
      });
    }

    input.target = await getMember(message.guild, targetSearch);
    if (!input.target) {
      return send({
        embeds: [
          new ErrorEmbed(
            `couldn't find that member to use **${selected.name}** on. choose a member from this server`,
          ),
        ],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 2);

  if (definition.handler) return definition.handler.run(message, input);

  if (selected.role == "booster") {
    let boosters = await getBoosters(message.member);
    let amount = input.amount;

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
      return send({
        embeds: [
          new ErrorEmbed(getItemUseAmountError(selected, inventory.count(selected.id), amount)),
        ],
      });

    const global = Boolean(selected.boosterEffect.global);

    await Promise.all([
      addBooster(message.member, selected.id, amount, undefined, global ? "global" : "user"),
      addStat(message.member, selected.id, amount),
      removeInventoryItem(message.member, selected.id, amount),
    ]);

    boosters = await getBoosters(message.member);

    const embed = new CustomEmbed(message.member).setHeader("boosters", message.author.avatarURL());

    let desc = `you have activated ${amount > 1 ? `${amount}x ` : ""}**${selected.name}**${global ? " (global)" : ""}`;

    if (["cake", "cookie", "lucky_cheese"].includes(selected.id)) {
      if (selected.id === "cookie") {
        addTaskProgress(message.author.id, "eat_cookies", amount);
      }
      desc = `you have eaten ${amount > 1 ? `${amount} ` : "a "}**${pluralize(
        selected,
        amount,
      )}** 😋`;
    }

    embed.setDescription(desc);
    const limitNote =
      amount < input.amount
        ? `used ${amount} of ${input.amount.toLocaleString()} to fit the booster stacking limit`
        : "";
    if (limitNote) embed.setFooter({ text: limitNote });

    const pages = await getBoostersDisplay(boosters, embed);

    if (pages.size <= 1) return send({ embeds: [embed] });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("btn-previous-page")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("btn-next-page")
        .setLabel("next")
        .setStyle(ButtonStyle.Primary),
    );

    const msg = await send({ embeds: [embed], components: [row] });

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
        manager.embed.setFooter({
          text: `page ${manager.currentPage}/${manager.lastPage}${limitNote ? ` · ${limitNote}` : ""}`,
        });
        return manager.embed;
      },
    });

    return manager.listen();
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

    amount = input.amount;
    if (input.all) {
      amount = Math.min(amount, upgrade.stack_limit - (userUpgrade?.amount ?? 0));
    }

    allowed =
      (!userUpgrade && amount <= upgrade.stack_limit) ||
      (userUpgrade && userUpgrade.amount + amount <= upgrade.stack_limit);

    if (!allowed) {
      return send({
        embeds: [
          new ErrorEmbed(
            `you can add at most ${upgrade.stack_limit - (userUpgrade?.amount ?? 0)} more ${pluralize(selected, upgrade.stack_limit - (userUpgrade?.amount ?? 0))}`,
          ),
        ],
      });
    }

    if (inventory.count(selected.id) < amount)
      return send({
        embeds: [
          new ErrorEmbed(getItemUseAmountError(selected, inventory.count(selected.id), amount)),
        ],
      });

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    for (let i = 0; i < amount; i++) {
      await addWorkerUpgrade(message.member, upgrade.for, upgrade.id);
    }

    await removeInventoryItem(message.member, selected.id, amount);
    await addStat(message.member, selected.id, amount);

    const embed = new CustomEmbed(
      message.member,
      `you have activated ${amount} **${pluralize(
        upgrade,
        amount,
      )}** on your **${getBaseWorkers()[upgrade.for].name}**\n\n${
        userUpgrade ? userUpgrade.amount + amount : amount
      }/${upgrade.stack_limit}`,
    ).setHeader("use", message.author.avatarURL());

    if (amount < input.amount) {
      embed.setFooter({
        text: `used ${amount} of ${input.amount.toLocaleString()} to reach the worker upgrade limit`,
      });
    }
    return send({ embeds: [embed] });
  } else if (selected.role === "pet") {
    const currentLevel = (await getUserPet(message.member, selected.id))?.level ?? 0;
    const petData = getPetsData()[selected.id];

    try {
      const pet = await addPet(message.member, selected.id);
      addStat(message.member, selected.id, petData.items[pet.level - 1]);

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `${selected.emoji} your **${selected.name}** is now level **${pet.level}/${petData.items.length}**`,
          ).setHeader(
            currentLevel === 0 ? "pet unlocked" : "pet upgraded",
            message.author.avatarURL(),
          ),
        ],
      });
    } catch (error) {
      return send({
        embeds: [new ErrorEmbed(error instanceof Error ? error.message : "failed to add pet")],
      });
    }
  } else if (selected.role === "bakery-upgrade") {
    let amount = input.amount;

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count(selected.id) < amount)
      return send({
        embeds: [
          new ErrorEmbed(getItemUseAmountError(selected, inventory.count(selected.id), amount)),
        ],
      });

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

    if (amount < input.amount) {
      embed.setFooter({
        text: `used ${amount} of ${input.amount.toLocaleString()} to reach the bakery upgrade limit`,
      });
    }
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
    let amount = input.amount;

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (inventory.count(selected.id) < amount)
      return send({
        embeds: [
          new ErrorEmbed(getItemUseAmountError(selected, inventory.count(selected.id), amount)),
        ],
      });

    await removeInventoryItem(message.member, selected.id, amount);
    await addFarm(message.member, selected.plantId, amount);

    const farm = await getFarm(message.member);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you've planted ${amount} ${pluralize(selected, amount)} in your farm` +
            (farm.length === amount
              ? "\n\nif you're new to farming, it's recommended you read the [farm care guide](https://nypsi.xyz/wiki/economy/farm?ref=bot-help#caring-for-your-farm) to make sure you don't kill your plants"
              : ""),
        ),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
