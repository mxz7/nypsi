import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  LabelBuilder,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomContainer, CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { DabloonShopItem } from "../types/Economy";
import Constants from "../utils/Constants";
import {
  addInventoryItem,
  getInventory,
  removeInventoryItem,
} from "../utils/functions/economy/inventory";
import { getDabloonsShop, getItems } from "../utils/functions/economy/utils";
import { getEmojiImage } from "../utils/functions/image";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("dabloons", "view the dabloons shop", "money").setAliases(["dabloon"]);

cmd.slashEnabled = true;

const componentIds = {
  select: "dabloons-item-select",
  amount: "dabloons-amount",
  buy: "dabloons-buy",
  amountModal: "dabloons-amount-modal",
} as const;

type Order = {
  itemId: string;
  amount: number;
  cost: number;
};

type SaleItem = {
  itemId: string;
  sale: number;
};

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  const baseMsg = await buildMessage(message.member);

  const msg = await send({ components: [baseMsg], flags: MessageFlags.IsComponentsV2 });

  listen(message, msg);
}

cmd.setRun(run);

module.exports = cmd;

async function buildMessage(member: GuildMember, disableButtons = false, item?: Order) {
  const items = getDabloonsShop();
  const itemData = getItems();
  const inventory = await getInventory(member);
  const dabloonCount = inventory.count("dabloon");

  const itemsText: string[] = [];

  const saleItem = await getSaleItem();

  for (const item of Object.values(items)) {
    itemsText.push(buildItemString(item, 1, saleItem));
  }

  const itemSelect = await buildSelectMenu(item?.itemId, disableButtons);

  const amountSelectButton = buildAmountButton(disableButtons ? true : item === undefined);
  const buyButton = buildBuyButton(disableButtons ? true : item === undefined);

  const container = new CustomContainer(member)
    .addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent("## dabloons shop\n" + itemsText.join("\n")),
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail.setURL(getEmojiImage(itemData["dabloon"].emoji)),
        ),
    )
    .addSeparatorComponents((separator) => separator);

  if (item) {
    container.addTextDisplayComponents((text) =>
      text.setContent(
        `buying \`${item.amount}x\` ${buildItemString(items[item.itemId], item.amount, saleItem)}`,
      ),
    );
  }

  container
    .addActionRowComponents((row) => row.addComponents(itemSelect))
    .addActionRowComponents((row) =>
      row.addComponents(amountSelectButton, buyButton, buildShopButton()),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        `-# you have ${dabloonCount.toLocaleString()} ${pluralize(itemData["dabloon"], dabloonCount)}`,
      ),
    );

  return container;
}

async function listen(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  msg: Message,
  item?: Order,
) {
  const interaction = await msg
    .awaitMessageComponent({
      filter: (i) => i.user.id === message.author.id,
      time: 120000,
    })
    .catch(() => {});

  if (!interaction) {
    const newMsg = await buildMessage(message.member, true);
    msg.edit({ components: [newMsg] });
    return;
  }

  if (interaction.customId === componentIds.select) {
    const itemId = (interaction as StringSelectMenuInteraction).values[0];
    item = {
      cost: await getCost({ itemId, amount: 1 }),
      amount: 1,
      itemId,
    };

    const newMsg = await buildMessage(message.member, false, item);
    interaction.update({ components: [newMsg] });
    return listen(message, msg, item);
  } else if (interaction.customId === componentIds.amount) {
    if (!item) {
      // wtf!
      const newMsg = await buildMessage(message.member);
      interaction.update({ components: [newMsg] });
      return listen(message, msg);
    }

    const modal = new ModalBuilder()
      .setCustomId(componentIds.amountModal)
      .setTitle("dabloons shop")
      .setLabelComponents(
        new LabelBuilder()
          .setLabel(`how many ${getItems()[item.itemId].plural} do you want to buy?`)
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId(componentIds.amount)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(3),
          ),
      );

    await interaction.showModal(modal);

    const modalInteraction = await interaction
      .awaitModalSubmit({
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
      })
      .catch(() => {});

    if (!modalInteraction) {
      return listen(message, msg, item);
    }

    let amount = parseInt(modalInteraction.fields.getTextInputValue(componentIds.amount));

    if (isNaN(amount) || amount <= 0) {
      modalInteraction.reply({
        embeds: [new ErrorEmbed("lol nice one loser")],
        flags: MessageFlags.Ephemeral,
      });
      return listen(message, msg, item);
    }

    modalInteraction.deferUpdate();

    if (amount > 999) {
      amount = 999;
    }

    item.amount = amount;
    item.cost = await getCost(item);

    const newMsg = await buildMessage(message.member, false, item);
    await msg.edit({ components: [newMsg] });
    return listen(message, msg, item);
  } else if (interaction.customId === componentIds.buy) {
    if (!item || !item.cost) {
      // wtf!
      const newMsg = await buildMessage(message.member);
      interaction.update({ components: [newMsg] });
      return listen(message, msg);
    }

    const inventory = await getInventory(message.member);

    if (inventory.count("dabloon") < item.cost) {
      interaction.reply({
        embeds: [new ErrorEmbed("you don't have enough dabloons")],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buildShopButton()),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return listen(message, msg, item);
    }

    await removeInventoryItem(message.member, "dabloon", item.cost);
    await addInventoryItem(message.member, item.itemId, item.amount);

    interaction.reply({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ bought \`${item.amount}x\` ${getItems()[item.itemId].emoji} **${getItems()[item.itemId].name}** for **${item.cost.toLocaleString()}** dabloons`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    const newMsg = await buildMessage(message.member);
    await msg.edit({ components: [newMsg] });
    return;
  }
}

async function getCost(item: Omit<Order, "cost">) {
  const dabloonShop = getDabloonsShop();

  const saleItem = await getSaleItem();

  let cost = dabloonShop[item.itemId].cost;

  if (saleItem && saleItem.itemId === item.itemId) {
    cost -= cost * saleItem.sale;
  }

  return Math.ceil(cost * item.amount);
}

async function getSaleItem() {
  const saleData = await redis.get(Constants.redis.nypsi.DABLOONS_SALE);
  if (!saleData) return undefined;
  return JSON.parse(saleData) as SaleItem;
}

async function buildSelectMenu(selected?: string, disabled = false) {
  const items = getDabloonsShop();
  const itemData = getItems();

  const builder = new StringSelectMenuBuilder()
    .setCustomId(componentIds.select)
    .setPlaceholder("select an item")
    .setDisabled(disabled);

  for (const item of Object.values(items)) {
    builder.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${itemData[item.itemId].plural}`)
        .setDescription(`${await getCost({ itemId: item.itemId, amount: 1 })} dabloons`)
        .setValue(item.itemId)
        .setEmoji(itemData[item.itemId].emoji)
        .setDefault(selected === item.itemId),
    );
  }

  return builder;
}

function buildAmountButton(disabled: boolean) {
  return new ButtonBuilder()
    .setCustomId(componentIds.amount)
    .setLabel("set amount")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
}

function buildBuyButton(disabled: boolean) {
  return new ButtonBuilder()
    .setCustomId(componentIds.buy)
    .setLabel("buy")
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);
}

function buildShopButton() {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("get dabloons")
    .setEmoji(getItems()["dabloon"].emoji)
    .setURL("https://ko-fi.com/nypsi/shop");
}

function buildItemString(item: DabloonShopItem, amount = 1, saleItem?: SaleItem) {
  const { itemId, cost: itemCost } = item;

  const itemData = getItems();

  const isSale = saleItem && saleItem.itemId === item.itemId;
  const cost = Math.ceil(
    isSale ? (item.cost - item.cost * saleItem.sale) * amount : item.cost * amount,
  );

  let msg =
    `${itemData[itemId].emoji} **${itemData[itemId].name}**\n` +
    `- ${isSale ? `~~${(itemCost * amount).toLocaleString()}~~ **${cost.toLocaleString()}**` : itemCost.toLocaleString()} ${itemData["dabloon"].emoji} dabloons`;

  if (isSale) {
    msg += ` **${Math.floor(saleItem.sale * 100)}% SALE!!**`;
  }

  return msg;
}
