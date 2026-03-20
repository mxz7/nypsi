import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
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
import { sort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomContainer, CustomEmbed, ErrorEmbed, getColor } from "../models/EmbedBuilders";
import {
  getInventory,
  removeInventoryItem,
  selectItem,
} from "../utils/functions/economy/inventory";
import {
  addToMuseum,
  getMuseum,
  getMuseumCategories,
  showMuseumLeaderboard,
} from "../utils/functions/economy/museum";
import { createUser, formatNumber, getItems, userExists } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member";
import { default as PageManager } from "../utils/functions/page";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("museum", "view your museum progress", "money")
  .setAliases(["collect"])
  .setDocs("https://nypsi.xyz/wiki/economy/items/museum");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((progress) =>
    progress
      .setName("donate")
      .setDescription("donate an item to the museum")
      .addStringOption((option) =>
        option
          .setName("museum-donate-item")
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
          .setName("museum-item")
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
      .setDescription("view your museum by either category or item")
      .addStringOption((option) =>
        option
          .setName("museum-category")
          .setDescription("the category you want to view")
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("museum-item")
          .setDescription("the item you want to view")
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((lookup) =>
    lookup
      .setName("lookup")
      .setDescription("lookup a player's museum")
      .addUserOption((option) =>
        option.setName("user").setDescription("view the museum of this user").setRequired(true),
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
  const sortedItems = sort(Object.values(items)).asc((i) => i.id);
  const itemCategories = getMuseumCategories();

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

  const itemsPerPage = 8;

  const doFindItem = async (interaction: ButtonInteraction, defer = true) => {
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

    if (!res || !res.isModalSubmit()) return;

    const item = selectItem(res.fields.getTextInputValue("item").toLowerCase());

    if (!item) {
      await res.reply({
        embeds: [new ErrorEmbed("invalid item")],
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }

    if (!item.museum) {
      await res.reply({
        embeds: [new ErrorEmbed("that item is not in the museum")],
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }

    const index = sortedItems
      .filter((i) => i.museum?.category == item.museum.category)
      .findIndex((i) => i.id == item.id);

    const page = Math.floor(index / itemsPerPage) + 1;

    if (defer) await res.deferUpdate();

    return { item, interaction: res, page: page, category: item.museum.category };
  };

  let msg: Message;

  const homeView = async (member = message.member) => {
    const museum = await getMuseum(member);

    const desc: string[] = [];

    for (const item of await museum.getFavoritedItems()) {
      desc.push(
        `**${item.emoji} ${item.name}\n**` +
          `donated **${museum.count(item).toLocaleString()}** (#**${(await museum.leaderboardPlacement(item)).toLocaleString()}**)`,
      );
    }

    const container = (disabled = false) => {
      const container = new ContainerBuilder()
        .setAccentColor(resolveColor(getColor(member)))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${member.user.username}'s museum\n**featured items**`,
          ),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            desc.length ? desc.join("\n\n") : "no featured items ):",
          ),
        );

      if (member.id == message.member.id) {
        container
          .addActionRowComponents((row) =>
            row.addComponents(
              new ButtonBuilder()
                .setCustomId("edit")
                .setLabel("edit")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
              new ButtonBuilder()
                .setCustomId("find")
                .setLabel("find item")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            ),
          )
          .addSeparatorComponents((separator) => separator)
          .addActionRowComponents((row) => row.addComponents(categorySelectMenu(disabled)));
      }

      return container;
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

    if (member.id != message.member.id) return;

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
        return categoryView(categorySelect);
      } else if (res == "find") {
        const res = await doFindItem(interaction as ButtonInteraction);

        if (!res) return pageManager();

        return categoryView(res.category, res.page);
      } else if (res == "edit") {
        return editView();
      }

      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
      return pageManager();
    };

    return pageManager();
  };

  const editView = async () => {
    const museum = await getMuseum(message.member);

    let featuredItems = (await museum.getFavoritedItems())
      .concat(Array(5).fill(undefined))
      .slice(0, 5);

    const container = async (disabled = false) => {
      const container = new ContainerBuilder()
        .setAccentColor(resolveColor(getColor(message.member)))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${message.member.user.username}'s museum\n**featured items**`,
          ),
        )
        .addSeparatorComponents((separator) => separator);

      for (let i = 0; i < featuredItems.length; i++) {
        container
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              featuredItems[i]
                ? `**${featuredItems[i].emoji} ${featuredItems[i].name}\n**` +
                    `donated **${museum.count(featuredItems[i]).toLocaleString()}** (#**${(await museum.leaderboardPlacement(featuredItems[i])).toLocaleString()}**)`
                : `no item selected`,
            ),
          )

          .addActionRowComponents((row) =>
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`alter-${i}`)
                .setLabel(featuredItems[i] ? "delete" : "add")
                .setStyle(featuredItems[i] ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(disabled),
              new ButtonBuilder()
                .setCustomId(`up-${i}`)
                .setEmoji("⬆️")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || i == 0),
              new ButtonBuilder()
                .setCustomId(`down-${i}`)
                .setEmoji("⬇️")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || i == featuredItems.length - 1),
            ),
          );
      }

      return container
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((row) =>
          row.addComponents(
            new ButtonBuilder()
              .setCustomId("save")
              .setLabel("save")
              .setStyle(ButtonStyle.Success)
              .setDisabled(disabled),
            new ButtonBuilder()
              .setCustomId("clear")
              .setLabel("clear")
              .setStyle(ButtonStyle.Danger)
              .setDisabled(disabled || featuredItems.every((i) => i === undefined)),
          ),
        );
    };

    if (msg) {
      await msg.edit({
        flags: MessageFlags.IsComponentsV2,
        components: [await container()],
      });
    } else {
      msg = await send({
        flags: MessageFlags.IsComponentsV2,
        components: [await container()],
      });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          if (!collected.customId.startsWith("alter-"))
            await collected.deferUpdate().catch(() => {
              fail = true;
              return pageManager();
            });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [await container(true)],
          });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "save") {
        if (
          JSON.stringify(featuredItems.filter(Boolean)) !=
          JSON.stringify(await museum.getFavoritedItems())
        ) {
          await museum.setFavoritedItems(featuredItems);
        }

        return homeView();
      } else if (res == "clear") {
        featuredItems = Array(5).fill(undefined);
      } else if (res.startsWith("alter-")) {
        const slot = parseInt(res.split("-")[1]);

        if (featuredItems[slot]) {
          featuredItems[slot] = undefined;
          await interaction.deferUpdate();
        } else {
          const res = await doFindItem(interaction as ButtonInteraction, false);
          if (!res) return pageManager();

          if (!museum.has(res.item)) {
            await res.interaction.reply({
              embeds: [new ErrorEmbed("you have not donated that item yet")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }

          if (featuredItems.findIndex((i) => i?.id == res.item.id) != -1) {
            await res.interaction.reply({
              embeds: [new ErrorEmbed("you already have that item featured")],
              flags: MessageFlags.Ephemeral,
            });
            return pageManager();
          }

          await res.interaction.deferUpdate();

          featuredItems[slot] = res.item;
        }
      } else if (res.startsWith("up-")) {
        const slot = parseInt(res.split("-")[1]);

        if (slot > 0) {
          const temp = featuredItems[slot];
          featuredItems[slot] = featuredItems[slot - 1];
          featuredItems[slot - 1] = temp;
        }
      } else if (res.startsWith("down-")) {
        const slot = parseInt(res.split("-")[1]);

        if (slot < featuredItems.length - 1) {
          const temp = featuredItems[slot];
          featuredItems[slot] = featuredItems[slot + 1];
          featuredItems[slot + 1] = temp;
        }
      }

      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [await container()] });
      return pageManager();
    };

    return pageManager();
  };

  const categoryView = async (category: string, currentPage = 1) => {
    const itemsInCategory = Object.values(sortedItems).filter(
      (i) => i.museum?.category == category,
    );
    const museum = await getMuseum(message.member);

    const desc: string[] = [];

    let completed = 0;

    for (const item of itemsInCategory) {
      if (museum.completed(item)) completed++;

      const lines = [
        `- **${item.emoji} ${item.name}**`,

        `  - donated **${museum.count(item).toLocaleString()}${item.museum.no_overflow ? `/${item.museum.threshold}` : ""}**${
          museum.completed(item) && !item.account_locked
            ? ` - first donated <t:${Math.floor(museum.completedAt(item).getTime() / 1000)}:R> (#**${(await museum.completedPlacement(item)).toLocaleString()}**)`
            : ""
        }`,

        `${
          !museum.completed(item)
            ? `  - **${(item.museum.threshold - museum.count(item)).toLocaleString()}** more to complete`
            : item.museum.no_overflow
              ? `  - completed!`
              : `  - #**${(await museum.leaderboardPlacement(item)).toLocaleString()}** on leaderboard`
        }`,
      ];

      desc.push(lines.join("\n"));
    }

    const pages = PageManager.createPages(desc, itemsPerPage);

    const container = (disabled = false) => {
      const builder = new CustomContainer()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${message.member.user.username}'s museum\n**${category}${completed === itemsInCategory.length ? "(completed)" : ""}**`,
          ),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(pages.get(currentPage).join("\n")),
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
                .setLabel("find item")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            ),
          );
      } else {
        builder.addActionRowComponents((row) =>
          row.addComponents(
            new ButtonBuilder()
              .setCustomId("find")
              .setLabel("find item")
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
        return categorySelect == "home" ? homeView() : categoryView(categorySelect);
      } else if (res == "➡") {
        if (currentPage < pages.size) currentPage++;
      } else if (res == "⬅") {
        if (currentPage > 1) currentPage--;
      } else if (res == "find") {
        const res = await doFindItem(interaction as ButtonInteraction);

        if (!res) return pageManager();

        return categoryView(res.category, res.page);
      }

      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
      return pageManager();
    };

    return pageManager();
  };

  await addCooldown(cmd.name, message.member, 3);

  if (args[0]?.toLowerCase() == "donate") {
    if (args.length < 2) {
      return send({
        embeds: [new ErrorEmbed("/museum donate <item> <amount>")],
        flags: MessageFlags.Ephemeral,
      });
    }

    let item = selectItem(args[1]);

    if (!item) {
      return send({ embeds: [new ErrorEmbed("invalid item")], flags: MessageFlags.Ephemeral });
    }

    if (!item.museum) {
      return send({
        embeds: [new ErrorEmbed("that item cannot be donated to the museum")],
        flags: MessageFlags.Ephemeral,
      });
    }

    let inventory = await getInventory(message.member);

    let amount = args.length == 2 ? 1 : formatNumber(args[2]);

    if (args[2]?.toLowerCase() == "all") amount = inventory.count(item);

    if (amount <= 0 || isNaN(amount) || !amount) {
      return send({ embeds: [new ErrorEmbed("invalid amount")], flags: MessageFlags.Ephemeral });
    }

    const museum = await getMuseum(message.member);

    let overflow = false;

    if (item.museum.no_overflow && amount > item.museum.threshold - museum.count(item)) {
      amount = item.museum.threshold - museum.count(item);
      overflow = true;

      if (amount <= 0) {
        return send({
          embeds: [new ErrorEmbed("you have reached the donation cap for this item")],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (inventory.count(item) < amount)
      return send({
        embeds: [new ErrorEmbed(`you don't have enough ${item.plural}`)],
        flags: MessageFlags.Ephemeral,
      });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirm").setLabel("confirm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cancel").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

    const msg = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `confirm that you want to donate **${amount.toLocaleString()}** ${item.emoji} ${pluralize(item, amount)} to your museum\n${overflow ? "-# amount limited due to this item's donation cap" : ""}\n**you cannot get this back!**`,
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
      inventory = await getInventory(message.member);
      if (inventory.count(item) < amount)
        return interaction.update({ embeds: [new ErrorEmbed(`sneaky bitch`)], components: [] });

      await addToMuseum(message.member, item.id, amount);
      await removeInventoryItem(message.member, item.id, amount);

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
    if (args.length == 1)
      return send({
        embeds: [new ErrorEmbed(`/museum top <item>`)],
        flags: MessageFlags.Ephemeral,
      });
    return showMuseumLeaderboard(message, send, args);
  } else if (args[0]?.toLowerCase() == "lookup") {
    if (args.length == 1)
      return send({
        embeds: [new ErrorEmbed(`/museum lookup <user>`)],
        flags: MessageFlags.Ephemeral,
      });
    args.shift();

    let target = await getMember(message.guild, args.join(" "));
    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")], flags: MessageFlags.Ephemeral });
    }

    if (!(await userExists(target))) await createUser(target);

    return homeView(target);
  } else if (args.length) {
    if (args[0]?.toLowerCase() == "view") args.shift();
    if (args.length == 0 || args[0].toLowerCase() == "home") return homeView();
    let category = args[0].toLowerCase();
    if (itemCategories.includes(category)) {
      return categoryView(category);
    }

    const item = selectItem(args[0]);
    if (item && item.museum) {
      const index = sortedItems
        .filter((i) => i.museum?.category == item.museum.category)
        .findIndex((i) => i.id == item.id);

      const page = Math.floor(index / itemsPerPage) + 1;

      return categoryView(item.museum.category, page);
    }

    const target = await getMember(message.guild, args.join(" "));
    if (target) {
      if (!(await userExists(target))) await createUser(target);
      return homeView(target);
    }

    return send({
      embeds: [new ErrorEmbed(`could not find \`${category}\``)],
      flags: MessageFlags.Ephemeral,
    });
  } else if (args[0]?.toLowerCase() === "help") {
    const embed = new CustomEmbed(
      message.member,
      "**/museum view** - view your museum\n" +
        "**/museum donate** - donate items to your museum\n" +
        "**/museum top** - view museum leaderboards\n" +
        "**/museum lookup** - view a player's featured items",
    ).setHeader("museum help");

    return send({ embeds: [embed] });
  } else return homeView();
}

cmd.setRun(run);

module.exports = cmd;
