import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  ContainerBuilder,
  Interaction,
  LabelBuilder,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  resolveColor,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomContainer, CustomEmbed, ErrorEmbed, getColor } from "../models/EmbedBuilders";
import { getInventory, selectItem } from "../utils/functions/economy/inventory";
import {
  addToMuseum,
  getMuseum,
  getMuseumCategories,
  showMuseumLeaderboard,
} from "../utils/functions/economy/museum";
import { getItems } from "../utils/functions/economy/utils";
import { default as PageManager } from "../utils/functions/page";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("museum", "view your museum progress", "money").setAliases(["collect"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((progress) =>
    progress
      .setName("donate")
      .setDescription("donate an item to the museum")
      .addStringOption((option) =>
        option
          .setName("museum-item")
          .setDescription("the item you want to donate")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("amount").setDescription("the amount you want to donate"),
      ),
  )
  .addSubcommand((top) =>
    top
      .setName("top")
      .setDescription("view the leaderboard(s) for an item")
      .addStringOption((option) =>
        option
          .setName("museum-lb-item")
          .setDescription("the item you want to view")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices([
            { name: "global", value: "global" },
            { name: "server", value: "server" },
          ])
          .setRequired(false),
      ),
  )
  .addSubcommand((view) =>
    view
      .setName("view")
      .setDescription("view your museum")
      .addStringOption((option) =>
        option
          .setName("museum-category")
          .setDescription("the category you want to view")
          .setAutocomplete(true),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  const items = getItems();

  const itemCategories = getMuseumCategories();

  let inventory = await getInventory(message.member);

  const categorySelectMenu = (disabled = false, selected = "home") => {
    return new StringSelectMenuBuilder()
      .setCustomId(`select-category`)
      .setDisabled(disabled)
      .addOptions(
        itemCategories.map((category) => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(category)
            .setValue(category)
            .setDefault(category == selected);
        }),
      );
  };

  const doCategorySelect = async (interaction: Interaction) => {
    if (!interaction.isStringSelectMenu() || interaction.customId != "select-category") {
      return false;
    }
    return interaction.values[0];
  };

  let msg: Message;

  const homeView = async () => {
    const container = (disabled = false) =>
      new ContainerBuilder()
        .setAccentColor(resolveColor(getColor(message.member)))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("## museum"))
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("select a category of item"))
        .addActionRowComponents((row) => row.addComponents(categorySelectMenu(disabled)));

    if (msg) {
      await msg.edit({
        flags: MessageFlags.IsComponentsV2,
        components: [container()],
      });
    } else {
      msg = await send({
        flags: MessageFlags.IsComponentsV2,
        components: [container()],
      });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          await collected.deferUpdate().catch(() => {
            fail = true;
            return pageManager();
          });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container(true)] });
        });

      if (fail) return;
      if (!response) return;

      const { interaction } = response;

      const categorySelect = await doCategorySelect(interaction);

      if (categorySelect) {
        inventory = await getInventory(message.member);
        return categoryView(categorySelect);
      }

      inventory = await getInventory(message.member);
      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
      return pageManager();
    };

    return pageManager();
  };

  const categoryView = async (category: string) => {
    const itemsInCategory = Object.values(items).filter((i) => i.museum?.category == category);
    const museum = await getMuseum(message.member);

    const desc: string[] = [];

    inPlaceSort(itemsInCategory).asc((item) => item.id);

    for (const item of itemsInCategory) {
      desc.push(
        `**${item.emoji} ${item.name}**\n` +
          `donated **${museum.count(item).toLocaleString()}**${museum.completed(item) ? ` - first donated <t:${Math.floor(new Date(museum.completedAt(item)).getTime() / 1000)}:R> (#**${(await museum.completedPlacement(item)).toLocaleString()}**)` : ""}\n` +
          `${!museum.completed(item) ? `donate **${(item.museum.threshold - museum.count(item)).toLocaleString()}** more to complete` : item.museum.no_overflow ? `quantity maxed!` : `#**${(await museum.leaderboardPlacement(item)).toLocaleString()}** on leaderboard`}`,
      );
    }

    const pages = PageManager.createPages(desc, 8);
    let currentPage = 1;

    const container = (disabled = false) => {
      const builder = new CustomContainer()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${message.member.user.username}'s museum - ${category}`,
          ),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(pages.get(currentPage).join("\n\n")),
        );

      if (pages.size > 1) {
        builder
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# page ${currentPage}/${pages.size}`),
          )
          .addActionRowComponents((row) =>
            row.addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || currentPage == 1),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || currentPage == pages.size),
              new ButtonBuilder()
                .setCustomId("find")
                .setLabel("find")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            ),
          );
      }

      return builder
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((row) => row.addComponents(categorySelectMenu(disabled, category)));
    };

    if (msg) {
      await msg.edit({
        flags: MessageFlags.IsComponentsV2,
        components: [container()],
      });
    } else {
      msg = await send({
        flags: MessageFlags.IsComponentsV2,
        components: [container()],
      });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          if (collected.customId != "find")
            await collected.deferUpdate().catch(() => {
              fail = true;
              return pageManager();
            });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container(true)] });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      const categorySelect = await doCategorySelect(interaction);

      if (categorySelect) {
        inventory = await getInventory(message.member);
        return categorySelect == "home" ? homeView() : categoryView(categorySelect);
      } else if (res == "➡") {
        if (currentPage < pages.size) currentPage++;
      } else if (res == "⬅") {
        if (currentPage > 1) currentPage--;
      } else if (res == "find") {
        const modal = new ModalBuilder()
          .setCustomId("museum-find")
          .setTitle("find an item")
          .addLabelComponents(
            new LabelBuilder()
              .setLabel("enter item name/id")
              .setTextInputComponent(
                new TextInputBuilder()
                  .setCustomId("item")
                  .setPlaceholder("enter item")
                  .setRequired(true)
                  .setStyle(TextInputStyle.Short),
              ),
          );

        await interaction.showModal(modal);

        const filter = (i: Interaction) => i.user.id == interaction.user.id;

        const res = await interaction.awaitModalSubmit({ filter, time: 120000 }).catch(() => {});

        if (!res) return;

        if (!res.isModalSubmit()) return;

        const item = selectItem(res.fields.getTextInputValue("item").toLowerCase());

        if (!item) {
          await res.reply({
            embeds: [new ErrorEmbed(`invalid item`)],
            flags: MessageFlags.Ephemeral,
          });
          return pageManager();
        }

        if (!item.museum) {
          await res.reply({
            embeds: [new ErrorEmbed(`that item is not in the museum`)],
            flags: MessageFlags.Ephemeral,
          });
          return pageManager();
        }

        if (item.museum.category !== category) {
          await res.reply({
            embeds: [
              new ErrorEmbed(
                `that item is located in **${item.museum.category}**, not in **${category}**`,
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return pageManager();
        }

        let page = 1;

        for (const [key, arr] of pages) {
          if (arr.some((s) => s.startsWith(`**${item.emoji} ${item.name}**`))) {
            page = key;
            break;
          }
        }

        res.deferUpdate();

        currentPage = page;
      }

      inventory = await getInventory(message.member);
      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
      return pageManager();
    };

    return pageManager();
  };

  await addCooldown(cmd.name, message.member, 3);

  if (args[0]?.toLowerCase() == "donate") {
    //todo: check for inventory and remove from it
    if (args.length < 2) {
      return send({ embeds: [new ErrorEmbed("/museum donate <item> <amount>")] });
    }

    let item = selectItem(args[1]);

    if (!item) {
      return send({ embeds: [new ErrorEmbed("invalid item")] });
    }

    if (!item.museum) {
      return send({ embeds: [new ErrorEmbed("that item cannot be donated to the museum")] });
    }

    let amount = args.length == 2 ? 1 : parseInt(args[2]);

    if (args[2]?.toLowerCase() == "all") amount = inventory.count(item);

    if (amount <= 0 || isNaN(amount) || !amount) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    const museum = await getMuseum(message.member);

    if (item.museum.no_overflow && amount > item.museum.threshold - museum.count(item))
      amount = item.museum.threshold - museum.count(item);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirm").setLabel("confirm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cancel").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

    const msg = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `confirm that you want to donate **${amount.toLocaleString()}** ${item.emoji} ${pluralize(item, amount)} to your museum`,
        ),
      ],
      components: [row],
    });

    const interaction = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
        componentType: ComponentType.Button,
      })
      .catch(() => {
        row.components.forEach((b) => b.setDisabled(true));
        msg.edit({ components: [row] });
      });

    if (!interaction) return;

    if (interaction.customId === "confirm") {
      await addToMuseum(message.member, item.id, amount);

      interaction.update({
        embeds: [
          new CustomEmbed(
            message.member,
            `you have donated **${amount.toLocaleString()}** ${item.emoji} ${pluralize(item, amount)} to your museum`,
          ),
        ],
        components: [],
      });
    } else {
      row.components.forEach((b) => b.setDisabled(true));
      interaction.update({ components: [row] });
    }
  } else if (args[0]?.toLowerCase() == "top") {
    if (args.length == 1) return send({ embeds: [new ErrorEmbed(`/museum top <item>`)] });
    return showMuseumLeaderboard(message, send, args);
  } else if (args.length) {
    if (args[0]?.toLowerCase() == "view") args.shift();
    if (args.length == 0 || args[0].toLowerCase() == "home") return homeView();
    let category = args[0]?.toLowerCase();
    if (itemCategories.includes(category)) {
      return categoryView(category);
    } else return send({ embeds: [new ErrorEmbed(`could not find category \`${category}\``)] });
  } else return homeView();
}

cmd.setRun(run);

module.exports = cmd;
