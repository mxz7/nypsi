import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  LabelBuilder,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Item } from "../types/Economy";
import { getInventory } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("inventory", "view items in your inventory", "money").setAliases(["inv"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("filter").setDescription("filter through your inventory with a search term"),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const items = getItems();
  let currentFilter: string;

  const setFilter = (inventory: { item: string; amount: number }[], filter: string) => {
    currentFilter = filter.toLowerCase();
    return inventory.filter((i) => {
      const item = items[i.item];
      if (item.aliases) {
        for (const alias of item.aliases) {
          if (alias.includes(filter)) return true;
        }
      }

      return (
        item.id.includes(filter) ||
        item.id.replaceAll("_", "").includes(filter) ||
        item.name.includes(filter) ||
        item.longDesc.includes(filter) ||
        item.shortDesc?.includes(filter) ||
        item.role.includes(filter)
      );
    });
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 3);

  let inventory = (await getInventory(message.member)).entries;

  if (inventory.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(message.member, "your inventory is empty").setHeader(
          "your inventory",
          message.author.avatarURL(),
          `https://nypsi.xyz/users/${message.author.id}?ref=bot-inv`,
        ),
      ],
    });
  }

  inPlaceSort(inventory).asc((i) => i.item);

  if (args.length != 0) {
    inventory = setFilter(inventory, args.join(" ").toLowerCase());

    if (inventory.length == 0) {
      return send({
        embeds: [new ErrorEmbed(`no items matched the filter: \`${args.join(" ")}\``)],
      });
    }
  }

  const pages = PageManager.createPages(
    inventory.map((i) => items[i.item]),
    6,
  );

  const embed = new CustomEmbed(message.member).setFooter({
    text: `page 1/${pages.size}${currentFilter ? ` filter: ${currentFilter}` : ""}`,
  });

  embed.setHeader(
    "your inventory",
    message.author.avatarURL(),
    `https://nypsi.xyz/users/${message.author.id}?ref=bot-inv`,
  );

  const updatePage = (page: Item[], embed: CustomEmbed) => {
    if (embed.data.fields?.length) embed.data.fields.length = 0;

    for (const item of page) {
      embed.addField(
        item.id,
        `${item.emoji} **${item.name}** ~~--~~ *${inventory
          .find((i) => i.item == item.id)
          .amount.toLocaleString()}*${item.shortDesc ? `\n${item.shortDesc}` : ""}`,
        true,
      );
    }

    return embed;
  };

  updatePage(pages.get(1), embed);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fil").setLabel("filter").setStyle(ButtonStyle.Secondary),
  );

  let msg: Message;

  if (pages.size == 1) {
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  const manager = new PageManager({
    embed: embed,
    message: msg,
    userId: message.author.id,
    row: row,
    pages,
    allowMessageDupe: true,
    onPageUpdate(manager) {
      manager.embed.setFooter({
        text: `page ${manager.currentPage}/${manager.lastPage}${
          currentFilter ? ` | filter: ${currentFilter}` : ""
        }`,
      });
      return manager.embed;
    },
    updateEmbed: updatePage,
    handleResponses: new Map().set(
      "fil",
      async (manager: PageManager<Item>, interaction: ButtonInteraction) => {
        const modal = new ModalBuilder()
          .setCustomId("inv-filter")
          .setTitle("filter inventory")
          .addLabelComponents(
            new LabelBuilder()
              .setLabel("enter term to filter by")
              .setTextInputComponent(
                new TextInputBuilder()
                  .setCustomId("filter")
                  .setPlaceholder("filter")
                  .setRequired(true)
                  .setStyle(TextInputStyle.Short),
              ),
          );

        await interaction.showModal(modal);

        const filter = (i: Interaction) => i.user.id == interaction.user.id;

        const res = await interaction.awaitModalSubmit({ filter, time: 120000 }).catch(() => {});

        if (!res) return;

        if (!res.isModalSubmit()) return;

        if (currentFilter) inventory = (await getInventory(message.member)).entries;

        const value = res.fields.getTextInputValue("filter").toLowerCase();

        inventory = setFilter(inventory, value);

        if (inventory.length == 0) {
          await res.reply({
            embeds: [new ErrorEmbed(`no items matched the filter: \`${value}\``)],
            flags: MessageFlags.Ephemeral,
          });
          return manager.listen();
        }

        args = value.split(" ");

        manager.pages = PageManager.createPages(
          inventory.map((i) => items[i.item]),
          6,
        );

        await res.deferUpdate();

        manager.updatePageFunc(manager.pages.get(1), manager.embed);
        manager.currentPage = 1;
        manager.lastPage = manager.pages.size;
        manager.rows[0].components[0].setDisabled(true);
        if (manager.lastPage == 1) manager.rows[0].components[1].setDisabled(true);
        manager.embed.setFooter({
          text: `page 1/${manager.lastPage}${currentFilter ? ` | filter: ${currentFilter}` : ""}`,
        });

        await manager.message.edit({
          embeds: [manager.embed],
          components: manager.rows,
        });
        return manager.listen();
      },
    ),
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
