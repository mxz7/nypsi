import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Collection,
  CommandInteraction,
  CommandInteractionOption,
  GuildBasedChannel,
  GuildMember,
  Interaction,
  InteractionType,
  MessageActionRowComponentBuilder,
  Role,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../init/database";
import { createNypsiInteraction, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { addProgress } from "../utils/functions/economy/achievements";
import { buyAuctionOne, buyFullAuction } from "../utils/functions/economy/auctions";
import { getInventory, openCrate } from "../utils/functions/economy/inventory";
import { getPrestige } from "../utils/functions/economy/prestige";
import { addItemUse } from "../utils/functions/economy/stats";
import { getAchievements, getItems, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { claimFromWorkers } from "../utils/functions/economy/workers";
import { getReactionRolesByGuild } from "../utils/functions/guilds/reactionroles";
import { getKarma } from "../utils/functions/karma/karma";
import { getKarmaShopItems, isKarmaShopOpen } from "../utils/functions/karma/karmashop";
import PageManager from "../utils/functions/page";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { runCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

export default async function interactionCreate(interaction: Interaction) {
  if (await isUserBlacklisted(interaction.user.id)) return;

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

      const items = await getKarmaShopItems();
      const karma = await getKarma(interaction.user.id);

      let options = Object.keys(items).filter(
        (item) =>
          (item.includes(focused.value) || items[item].name.includes(focused.value)) &&
          items[item].items_left > 0 &&
          items[item].cost <= karma &&
          items[item].limit > (items[item].bought.has(interaction.user.id) ? items[item].bought.get(interaction.user.id) : 0)
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
    } else if (focused.name === "reaction-role") {
      const reactionRoles = await getReactionRolesByGuild(interaction.guild);

      const filtered = reactionRoles.filter(
        (rr) =>
          rr.messageId.includes(focused.value) || rr.description.includes(focused.value) || rr.title.includes(focused.value)
      );

      return interaction.respond(
        filtered.map((rr) => {
          let title = rr.title;

          if (title.length > 20) title = title.substring(0, 20) + "...";

          return { name: title ? `${title} (${rr.messageId})` : rr.messageId, value: rr.messageId };
        })
      );
    }
  }

  if (interaction.type == InteractionType.MessageComponent) {
    if (interaction.customId == "b") {
      if (await isEcoBanned(interaction.user.id)) return;
      const auction = await prisma.auction.findFirst({
        where: {
          AND: [{ messageId: interaction.message.id }],
        },
      });

      if (auction && !auction.sold && (await userExists(auction.ownerId))) {
        if (auction.ownerId == interaction.user.id) {
          return await interaction.reply({
            embeds: [new ErrorEmbed("you cannot buy your own auction")],
            ephemeral: true,
          });
        }

        return buyFullAuction(interaction as ButtonInteraction, auction);
      } else if (auction.sold || auction.itemAmount === 0) {
        return await interaction.reply({ embeds: [new ErrorEmbed("too slow ):").removeTitle()], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
        await interaction.message.delete();
      }
    } else if (interaction.customId === "b-one") {
      if (await isEcoBanned(interaction.user.id)) return;
      const auction = await prisma.auction.findFirst({
        where: {
          AND: [{ messageId: interaction.message.id }],
        },
      });

      if (auction && !auction.sold && (await userExists(auction.ownerId))) {
        if (auction.ownerId == interaction.user.id) {
          return await interaction.reply({
            embeds: [new ErrorEmbed("you cannot buy your own auction")],
            ephemeral: true,
          });
        }

        return buyAuctionOne(interaction as ButtonInteraction, auction);
      } else if (auction.sold || auction.itemAmount === 0) {
        return await interaction.reply({ embeds: [new ErrorEmbed("too slow ):").removeTitle()], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
        await interaction.message.delete();
      }
    } else if (interaction.customId === "vote-crates") {
      if (await onCooldown("use", interaction.user.id)) {
        const embed = await getResponse("use", interaction.user.id);

        return interaction.reply({ embeds: [embed] });
      }

      await addCooldown("use", interaction.user.id, 7);

      const inventory = await getInventory(interaction.user.id, false);

      const crateAmount =
        Constants.VOTE_CRATE_PROGRESSION[await getPrestige(interaction.user.id)] ||
        Constants.VOTE_CRATE_PROGRESSION[Constants.VOTE_CRATE_PROGRESSION.length - 1];

      if (
        !inventory.find((i) => i.item === "vote_crate") ||
        inventory.find((i) => i.item === "vote_crate")?.amount < crateAmount
      ) {
        return interaction.reply({ embeds: [new ErrorEmbed(`you do not have ${crateAmount} vote crates`)] });
      }

      await interaction.deferReply();

      const embed = new CustomEmbed().setHeader(
        `${interaction.user.username}'s ${crateAmount} vote crate${crateAmount > 1 ? "s" : ""}`,
        interaction.user.avatarURL()
      );

      await Promise.all([
        addProgress(interaction.user.id, "unboxer", crateAmount),
        addItemUse(interaction.user.id, "vote_crate", crateAmount),
      ]);

      const foundItems = new Map<string, number>();

      for (let i = 0; i < crateAmount; i++) {
        const found = await openCrate(interaction.user.id, getItems()["vote_crate"]);

        for (const [key, value] of found.entries()) {
          if (foundItems.has(key)) {
            foundItems.set(key, foundItems.get(key) + value);
          } else {
            foundItems.set(key, value);
          }
        }
      }

      const desc: string[] = [];

      desc.push("you found: ");

      if (foundItems.has("money")) {
        desc.push(`- $${foundItems.get("money").toLocaleString()}`);
        foundItems.delete("money");
      }

      if (foundItems.has("xp")) {
        embed.setFooter({ text: `+${foundItems.get("xp").toLocaleString()}xp` });
        foundItems.delete("xp");
      }

      for (const [item, amount] of inPlaceSort(Array.from(foundItems.entries())).desc([
        (i) => getItems()[i[0]].rarity,
        (i) => i[1],
      ])) {
        desc.push(`- \`${amount}x\` ${getItems()[item].emoji} ${getItems()[item].name}`);
      }

      const pages = PageManager.createPages(desc, 15);

      embed.setDescription(pages.get(1).join("\n"));

      if (pages.size === 1) {
        return interaction.editReply({ embeds: [embed] });
      } else {
        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
        );

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        const manager = new PageManager({
          embed,
          message: msg,
          row,
          userId: interaction.user.id,
          pages,
        });

        return manager.listen();
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
    } else if (interaction.customId === "bake") {
      if (!interaction.channel.permissionsFor(interaction.user.id).has("SendMessages")) return;

      const int = interaction as unknown as NypsiCommandInteraction;

      int.author = interaction.user;
      int.commandName = "bake";

      setTimeout(() => {
        if (interaction.isRepliable()) {
          interaction.deferReply().catch(() => {});
        }
      }, 2500);

      return runCommand("bake", interaction as unknown as NypsiCommandInteraction, []);
    } else {
      if (!interaction.guild) return;
      const reactionRoles = await getReactionRolesByGuild(interaction.guild);

      if (reactionRoles.length === 0) return;

      const interactionMessageId = interaction.message.id;
      const customId = interaction.customId;

      const reactionRole = reactionRoles.find((r) => r.messageId === interactionMessageId);
      if (!reactionRole) return;

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (reactionRole.whitelist.length !== 0) {
        let allowed = false;
        for (const roleId of reactionRole.whitelist) {
          if (member.roles.cache.has(roleId)) allowed = true;
        }

        if (!allowed) {
          if (reactionRole.whitelist.length === 1) {
            const role = await interaction.guild.roles
              .fetch(reactionRole.whitelist[0])
              .then((r) => r.toString())
              .catch(() => {});
            return interaction.reply({
              embeds: [new ErrorEmbed(`you require ${role || reactionRole.whitelist[0]} to use this`)],
              ephemeral: true,
            });
          } else {
            const roles: string[] = [];

            for (const roleId of reactionRole.whitelist) {
              const role = await interaction.guild.roles
                .fetch(roleId)
                .then((r) => r.toString())
                .catch(() => {});

              roles.push(role || roleId);
            }

            return interaction.reply({
              embeds: [new ErrorEmbed(`to use this, you need one of:\n\n${roles.join("\n")}`)],
              ephemeral: true,
            });
          }
        }
      }

      const roleId = reactionRole.roles.find((r) => r.roleId === customId).roleId;
      if (!roleId) return;

      await interaction.deferReply({ ephemeral: true });

      const responseDesc: string[] = [];

      if (member.roles.cache.has(roleId)) {
        responseDesc.push(`- ${member.roles.cache.find((r) => r.id === roleId).toString()}`);
        await member.roles.remove(roleId);
      } else {
        if (reactionRole.mode === "UNIQUE") {
          for (const role of member.roles.cache.values()) {
            if (reactionRole.roles.find((r) => r.roleId === role.id)) {
              responseDesc.push(`- ${role.toString()}`);
              await member.roles.remove(role);
            }
          }
        }

        const role = await interaction.guild.roles.fetch(roleId);

        if (!role) return interaction.editReply({ embeds: [new ErrorEmbed("role is not valid")] });

        await member.roles.add(role);
        responseDesc.push(`+ ${role.toString()}`);
        logger.info(`(reaction roles) added ${role.id} to ${member.user.id}`);
      }

      return interaction.editReply({ embeds: [new CustomEmbed(member, responseDesc.join("\n"))] });
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
