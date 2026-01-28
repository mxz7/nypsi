import {
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomContainer } from "../models/EmbedBuilders";
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
} as const;

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

  const baseMsg = await buildBaseMessage(message.member);

  const msg = await send({ components: [baseMsg], flags: MessageFlags.IsComponentsV2 });
}

cmd.setRun(run);

module.exports = cmd;

async function buildBaseMessage(member: GuildMember) {
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

  const itemSelect = buildSelectMenu();

  const amountSelectButton = buildAmountButton(true);
  const buyButton = buildBuyButton(true);

  return new CustomContainer(member)
    .addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(
            "## dabloons shop\n" +
              itemsText.join("\n") +
              `\n-# you have ${dabloonCount} ${pluralize(itemData["dabloon"], dabloonCount)}`,
          ),
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail.setURL(getEmojiImage(itemData["dabloon"].emoji)),
        ),
    )
    .addSeparatorComponents((separator) => separator)
    .addActionRowComponents((row) => row.addComponents(itemSelect))
    .addActionRowComponents((row) => row.addComponents(amountSelectButton, buyButton));
}

function buildSelectMenu() {
  const items = getDabloonsShop();
  const itemData = getItems();

  return new StringSelectMenuBuilder()
    .setCustomId(componentIds.select)
    .setPlaceholder("select an item")
    .addOptions(
      Object.values(items).map((i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(itemData[i.itemId].name)
          .setDescription(`${i.cost.toLocaleString()} dabloons`)
          .setValue(i.itemId),
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
