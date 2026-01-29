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
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomContainer, ErrorEmbed } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
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

  for (const { itemId, cost } of Object.values(items)) {
    itemsText.push(
      `${itemData[itemId].emoji} **${itemData[itemId].name}**\n` +
        `- ${cost.toLocaleString()} ${itemData["dabloon"].emoji} dabloons`,
    );
  }

  const itemSelect = buildSelectMenu(item?.itemId, disableButtons);

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
        `buying \`${item.amount}x\` ${itemData[item.itemId].emoji} **${itemData[item.itemId].name}**\n` +
          `- ${item.cost.toLocaleString()} ${itemData["dabloon"].emoji} dabloons`,
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
        `-# you have ${dabloonCount} ${pluralize(itemData["dabloon"], dabloonCount)}`,
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

    if (inventory.count("dabloom") < item.cost) {
      interaction.reply({
        embeds: [new ErrorEmbed("you don't have enough dabloons")],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buildShopButton()),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return listen(message, msg, item);
    }
  }
}

async function getCost(item: Omit<Order, "cost">) {
  // TODO: handle discount
  const dabloonShop = getDabloonsShop();
  return dabloonShop[item.itemId].cost * item.amount;
}

function buildSelectMenu(selected?: string, disabled = false) {
  const items = getDabloonsShop();
  const itemData = getItems();

  return new StringSelectMenuBuilder()
    .setCustomId(componentIds.select)
    .setPlaceholder("select an item")
    .setDisabled(disabled)
    .addOptions(
      Object.values(items).map((i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(itemData[i.itemId].name)
          .setDescription(`${i.cost.toLocaleString()} dabloons`)
          .setValue(i.itemId)
          .setEmoji(itemData[i.itemId].emoji)
          .setDefault(selected === i.itemId),
      ),
    );
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
