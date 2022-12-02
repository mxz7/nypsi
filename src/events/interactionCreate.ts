import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  Collection,
  CommandInteraction,
  CommandInteractionOption,
  EmbedBuilder,
  GuildBasedChannel,
  GuildMember,
  Interaction,
  InteractionType,
  ModalBuilder,
  Role,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { createNypsiInteraction, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { addInventoryItem, getInventory } from "../utils/functions/economy/inventory";
import { createUser, getAchievements, getItems, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { claimFromWorkers } from "../utils/functions/economy/workers";
import { getKarma } from "../utils/functions/karma/karma";
import { getKarmaShopItems, isKarmaShopOpen } from "../utils/functions/karma/karmashop";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import requestDM from "../utils/functions/requestdm";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { getDmSettings } from "../utils/functions/users/notifications";
import { runCommand } from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";

export default async function interactionCreate(interaction: Interaction) {
  if (interaction.type == InteractionType.ApplicationCommandAutocomplete) {
    const focused = interaction.options.getFocused(true);

    focused.value = focused.value.toLowerCase();

    if (focused.name == "item") {
      const inventory = await getInventory(interaction.user.id);

      if (!inventory) return;

      const items = getItems();

      let options = inventory
        .map((i) => i.item)
        .filter(
          (item) =>
            item.includes(focused.value) ||
            items[item].name.includes(focused.value) ||
            items[item].aliases?.includes(focused.value)
        );

      if (options.length > 25) options = options.splice(0, 24);

      if (options.length == 0) return interaction.respond([]);

      const formatted = options.map((i) => ({
        name: `${
          items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<a:") || items[i].emoji.startsWith(":")
            ? ""
            : `${items[i].emoji} `
        }${items[i].name} [${inventory.find((x) => x.item == i).amount.toLocaleString()}]`,
        value: i,
      }));

      return await interaction.respond(formatted);
    } else if (focused.name == "item-buy") {
      const items = getItems();

      let options = Object.keys(items).filter(
        (item) =>
          (item.includes(focused.value) ||
            items[item].name.includes(focused.value) ||
            items[item].aliases?.includes(focused.value)) &&
          items[item].buy
      );

      if (options.length > 25) options = options.splice(0, 24);

      if (options.length == 0) return interaction.respond([]);

      const formatted = options.map((i) => ({
        name: `${
          items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<a:") || items[i].emoji.startsWith(":")
            ? ""
            : `${items[i].emoji} `
        }${items[i].name}`,
        value: i,
      }));

      return await interaction.respond(formatted);
    } else if (focused.name == "car") {
      const inventory = await getInventory(interaction.user.id);

      const items = getItems();

      let options = inventory
        .map((i) => i.item)
        .filter(
          (item) =>
            (item.includes(focused.value) ||
              items[item].name.includes(focused.value) ||
              items[item].aliases?.includes(focused.value)) &&
            items[item].role == "car"
        );

      options.push("cycle");

      if (options.length > 25) options = options.splice(0, 24);

      if (options.length == 0) return interaction.respond([]);

      const formatted = options.map((i) => ({
        name: `${
          items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<a:") || items[i].emoji.startsWith(":")
            ? ""
            : `${items[i].emoji} `
        }${items[i].name}`,
        value: i,
      }));

      return await interaction.respond(formatted);
    } else if (focused.name == "item-karmashop") {
      if (interaction.guild.id != "747056029795221513") return;
      if (!isKarmaShopOpen()) return;

      const items = getKarmaShopItems();
      const karma = await getKarma(interaction.user.id);

      let options = Object.keys(items).filter(
        (item) =>
          (item.includes(focused.value) || items[item].name.includes(focused.value)) &&
          items[item].items_left > 0 &&
          items[item].cost <= karma
      );

      if (options.length > 25) options = options.splice(0, 24);

      if (options.length == 0) return interaction.respond([]);

      const formatted = options.map((i) => ({
        name: `${
          items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<a:") || items[i].emoji.startsWith(":")
            ? ""
            : `${items[i].emoji} `
        }${items[i].name}`,
        value: i,
      }));

      return await interaction.respond(formatted);
    } else if (focused.name == "item-global") {
      const items = getItems();

      let options = Object.keys(items).filter(
        (item) =>
          item.includes(focused.value) ||
          items[item].name.includes(focused.value) ||
          items[item].aliases?.includes(focused.value)
      );

      if (options.length > 25) options = options.splice(0, 24);

      if (options.length == 0) return interaction.respond([]);

      const formatted = options.map((i) => ({
        name: `${
          items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<a:") || items[i].emoji.startsWith(":")
            ? ""
            : `${items[i].emoji} `
        }${items[i].name}`,
        value: i,
      }));

      return await interaction.respond(formatted);
    } else if (focused.name == "achievement") {
      const achievements = getAchievements();

      let options = Object.keys(achievements).filter(
        (i) => i.includes(focused.value) || achievements[i].name.replaceAll("*", "").toLowerCase().includes(focused.value)
      );

      if (options.length > 25) options = options.splice(0, 24);

      if (options.length == 0) return interaction.respond([]);

      const formatted = options.map((i) => ({
        name: `${
          achievements[i].emoji.startsWith("<:") ||
          achievements[i].emoji.startsWith("<a:") ||
          achievements[i].emoji.startsWith(":")
            ? ""
            : `${achievements[i].emoji} `
        }${achievements[i].name.replaceAll("*", "")}`,
        value: i,
      }));

      return await interaction.respond(formatted);
    } else if (focused.name == "craft-item") {
      const items = getItems();

      let options = Object.keys(items).filter(
        (item) =>
          items[item].craft &&
          (item.includes(focused.value) ||
            items[item].name.includes(focused.value) ||
            items[item].aliases?.includes(focused.value))
      );

      if (options.length > 25) options = options.splice(0, 24);

      if (options.length == 0) return interaction.respond([]);

      const formatted = options.map((i) => ({
        name: `${
          items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<a:") || items[i].emoji.startsWith(":")
            ? ""
            : `${items[i].emoji} `
        }${items[i].name}`,
        value: i,
      }));

      return await interaction.respond(formatted);
    }
  }

  if (interaction.type == InteractionType.MessageComponent) {
    if (interaction.customId == "b") {
      if (await isEcoBanned(interaction.user.id)) return;
      let auction = await prisma.auction.findFirst({
        where: {
          AND: [{ messageId: interaction.message.id }],
        },
        select: {
          bin: true,
          messageId: true,
          id: true,
          ownerId: true,
          itemAmount: true,
          itemName: true,
          sold: true,
        },
      });

      if (auction && !auction.sold && (await userExists(auction.ownerId))) {
        if (auction.ownerId == interaction.user.id) {
          return await interaction.reply({
            embeds: [new ErrorEmbed("you cannot buy your own auction")],
            ephemeral: true,
          });
        }

        if (auction.bin >= 10_000_000) {
          const modal = new ModalBuilder().setCustomId("auction-confirm").setTitle("confirmation");

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("confirmation")
                .setLabel("type 'yes' to confirm")
                .setPlaceholder(`this will cost $${auction.bin.toLocaleString()}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(3)
            )
          );

          await interaction.showModal(modal);

          const filter = (i: Interaction) => i.user.id == interaction.user.id;

          const res = await interaction.awaitModalSubmit({ filter, time: 120000 }).catch(() => {});

          if (!res) return;

          if (!res.isModalSubmit()) return;

          if (res.fields.fields.first().value.toLowerCase() != "yes") {
            return res.reply({ embeds: [new CustomEmbed().setDescription("✅ cancelled purchase")], ephemeral: true });
          }

          await res.deferUpdate();

          interaction = res;
        }

        auction = await prisma.auction.findFirst({
          where: {
            AND: [{ messageId: interaction.message.id }],
          },
          select: {
            bin: true,
            messageId: true,
            id: true,
            ownerId: true,
            itemAmount: true,
            itemName: true,
            sold: true,
          },
        });

        if (!auction) {
          await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
          await interaction.message.delete();
          return;
        }

        if (auction.sold) {
          return await interaction.reply({ embeds: [new ErrorEmbed("too slow ):").removeTitle()], ephemeral: true });
        }

        if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

        const balance = await getBalance(interaction.user.id);

        if (balance < Number(auction.bin)) {
          return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
        }

        await prisma.auction
          .update({
            where: {
              id: auction.id,
            },
            data: {
              sold: true,
            },
          })
          .catch(() => {});

        const tax = await getTax();

        let taxedAmount = 0;

        if (!(await isPremium(auction.ownerId)) && (await getTier(auction.ownerId)) != 4) {
          taxedAmount = Math.floor(Number(auction.bin) * tax);
          addToNypsiBank(taxedAmount);
        }

        await Promise.all([
          addInventoryItem(interaction.user.id, auction.itemName, auction.itemAmount),
          updateBalance(interaction.user.id, balance - Number(auction.bin)),
          updateBalance(auction.ownerId, (await getBalance(auction.ownerId)) + (Number(auction.bin) - taxedAmount)),
        ]);

        const items = getItems();

        if ((await getDmSettings(auction.ownerId)).auction) {
          const embedDm = new CustomEmbed()
            .setColor(Constants.TRANSPARENT_EMBED_COLOR)
            .setDescription(
              `your auction for ${auction.itemAmount}x ${items[auction.itemName].emoji} ${
                items[auction.itemName].name
              } has been bought by ${interaction.user.username} for $**${Math.floor(
                Number(auction.bin) - taxedAmount
              ).toLocaleString()}**${taxedAmount != 0 ? `(${(tax * 100).toFixed(1)}% tax)` : ""} `
            );

          await requestDM({
            client: interaction.client as NypsiClient,
            memberId: auction.ownerId,
            content: "your auction has been bought",
            embed: embedDm,
          });
        }

        const embed = new EmbedBuilder(interaction.message.embeds[0].data);

        const desc = embed.data.description.split("\n\n");

        desc[0] = `**bought** by ${interaction.user.username} <t:${Math.floor(Date.now() / 1000)}:R>`;

        embed.setDescription(desc.join("\n\n"));

        if (embed.data.footer?.text) {
          embed.setFooter({ text: embed.data.footer.text });
        }

        await interaction.message.edit({ embeds: [embed], components: [] });
      } else if (auction.sold) {
        return await interaction.reply({ embeds: [new ErrorEmbed("too slow ):").removeTitle()], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
        await interaction.message.delete();
      }
    } else if (interaction.customId == "w-claim") {
      if (await isEcoBanned(interaction.user.id)) return;
      const desc = await claimFromWorkers(interaction.user.id);

      const embed = new CustomEmbed()
        .setDescription(desc)
        .setColor(Constants.EMBED_SUCCESS_COLOR)
        .setHeader("workers", interaction.user.avatarURL())
        .disableFooter();

      return interaction.reply({ embeds: [embed] });
    }
  }

  if (interaction.type != InteractionType.ApplicationCommand) return;

  if (interaction.createdTimestamp < Date.now() - 2500) return;

  if (!interaction.guild) {
    const embed = new CustomEmbed()
      .setHeader("nypsi")
      .setColor(Constants.TRANSPARENT_EMBED_COLOR)
      .setDescription(
        "unfortunately you can't do commands in direct messages ):\n\n" +
          "if you need support or help for nypsi, please join the official nypsi server: https://discord.gg/hJTDNST"
      );
    return await interaction.reply({ embeds: [embed] });
  }

  const message: CommandInteraction & NypsiCommandInteraction = createNypsiInteraction(interaction);

  const args = [""];

  let fail = false;
  setTimeout(async () => {
    if (!interaction.isCommand()) return;
    if (interaction.replied) return;
    await interaction.deferReply().catch(() => {
      if (!interaction.isCommand()) return;
      logger.warn(`failed to defer slash command. ${interaction.commandName} by ${interaction.member.user.username}`);
      fail = true;
    });
  }, 2000);

  if (fail) return;

  const parseArgument = async (arg: CommandInteractionOption) => {
    switch (arg.type) {
      case ApplicationCommandOptionType.User:
        const user = arg.user;
        const guildMember = await interaction.guild.members.fetch(user.id).catch(() => {});

        if (guildMember) {
          args.push(`<@${user.id}>`);
          const collection: Collection<string, GuildMember> = new Collection();
          collection.set(user.id, guildMember);
          message.mentions = {
            members: collection,
          };
        } else {
          args.push(user.id);
        }
        break;
      case ApplicationCommandOptionType.Channel:
        const channel = arg.channel;
        args.push(`<#${channel.id}>`);

        const collection = new Collection<string, GuildBasedChannel>();
        collection.set(channel.id, channel as GuildBasedChannel);
        message.mentions = {
          channels: collection,
        };

        break;
      case ApplicationCommandOptionType.Role:
        const role = arg.role;
        args.push(`<@${role.id}>`);

        const roleCollection = new Collection<string, Role>();
        roleCollection.set(role.id, role as Role);
        message.mentions = {
          roles: roleCollection,
        };

        break;
      case ApplicationCommandOptionType.String:
        for (const str of arg.value.toString().split(" ")) {
          args.push(str);
        }
        break;
      case ApplicationCommandOptionType.Integer:
        args.push(arg.value.toString());
        break;
      case ApplicationCommandOptionType.SubcommandGroup:
        args.push(arg.name);
        for (const arg1 of arg.options) {
          await parseArgument(arg1);
        }
        break;
      case ApplicationCommandOptionType.Subcommand:
        args.push(arg.name);
        for (const arg1 of arg.options) {
          await parseArgument(arg1);
        }
        break;
    }
  };

  for (const arg of interaction.options.data) {
    await parseArgument(arg);
  }

  message.content = `[/]${interaction.commandName} ${args.join(" ")}`;

  return runCommand(interaction.commandName, message, args);
}
