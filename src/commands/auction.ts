import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  APIMessageComponentEmoji,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Item } from "../types/Economy";
import Constants from "../utils/Constants";
import {
  bumpAuction,
  createAuction,
  deleteAuction,
  deleteAuctionWatch,
  findAuctions,
  getAuctions,
  getAuctionWatch,
  setAuctionWatch,
  updateAuctionWatch,
} from "../utils/functions/economy/auctions";
import {
  addInventoryItem,
  calcItemValue,
  getInventory,
  selectItem,
  setInventoryItem,
} from "../utils/functions/economy/inventory";
import { getRawLevel } from "../utils/functions/economy/levelling";
import {
  createUser,
  formatBet,
  formatNumber,
  getItems,
  userExists,
} from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, addExpiry, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("auction", "create and manage your item auctions", "money").setAliases([
  "ah",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((manage) =>
    manage.setName("manage").setDescription("manage your current auctions"),
  )
  .addSubcommand((create) =>
    create
      .setName("create")
      .setDescription("create an auction")
      .addStringOption((option) =>
        option
          .setName("item")
          .setDescription("item you would like to sell")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("amount of items you would like to sell")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("cost")
          .setDescription("amount you would like this item to sell for")
          .setRequired(true),
      ),
  )
  .addSubcommand((search) =>
    search
      .setName("search")
      .setDescription("search for an auction")
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("item to find auctions for")
          .setAutocomplete(true)
          .setRequired(true),
      ),
  )
  .addSubcommand((watch) =>
    watch
      .setName("watch")
      .setDescription("receive notifications when an auction is created for chosen items")
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("item you want to toggle on/off")
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("max-cost")
          .setDescription("max cost you want to be notified for")
          .setRequired(false),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  if (!(await userExists(message.author.id))) await createUser(message.author.id);

  if (message.client.user.id !== Constants.BOT_USER_ID && message.author.id !== Constants.TEKOH_ID)
    return send({ embeds: [new ErrorEmbed("lol")] });
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  await addCooldown(cmd.name, message.member, 7);

  if (message.author.createdTimestamp > dayjs().subtract(1, "day").valueOf()) {
    return send({
      embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
    });
  }

  if ((await getRawLevel(message.member)) < 1) {
    return send({
      embeds: [new ErrorEmbed("you must be level 1 before you create an auction")],
    });
  }

  const items = getItems();

  const createAuctionProcess = async (msg: NypsiMessage) => {
    const embed = new CustomEmbed(message.member).setHeader(
      "create an auction",
      message.author.avatarURL(),
    );

    let inventory = await getInventory(message.member);

    if (inventory.length == 0) {
      embed.setDescription("you have nothing in your inventory");
      return edit({ embeds: [embed], components: [] }, msg);
    }

    let selected: Item;

    if (inventory.length <= 25) {
      embed.setDescription("select the **item you want to sell** from the dropdown list below");

      const options: StringSelectMenuOptionBuilder[] = [];

      for (const item of inventory) {
        if (item.amount != 0) {
          options.push(
            new StringSelectMenuOptionBuilder()
              .setValue(items[item.item].id)
              .setEmoji(items[item.item].emoji as APIMessageComponentEmoji)
              .setLabel(items[item.item].name),
          );
        }
      }

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("item")
          .setPlaceholder("item you want to sell")
          .setOptions(options),
      );

      await edit({ embeds: [embed], components: [row] }, msg);

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (i) => {
          await i.deferUpdate();
          if (!i.isStringSelectMenu()) return;
          return i.values[0];
        })
        .catch(() => {
          edit({ components: [] }, msg);
        });

      if (!res) return;

      selected = items[res];
    } else {
      embed.setDescription("what item would you like to sell?");

      await edit({ embeds: [embed], components: [] }, msg);

      const filter = (m: Message) => message.author.id == m.author.id;

      let fail = false;

      const res = await msg.channel
        .awaitMessages({ filter, time: 30000, max: 1 })
        .then(async (m) => {
          await m.first().delete();
          return m.first().content.toLowerCase();
        })
        .catch(() => {
          fail = true;
        });

      if (fail) return;
      if (!res) return;

      selected = selectItem(res);
    }

    if (!selected) {
      return message.channel.send({ embeds: [new ErrorEmbed("couldnt find that item")] });
    }

    if (
      !inventory.find((i) => i.item == selected.id) ||
      inventory.find((i) => i.item == selected.id).amount == 0
    ) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`you dont have ${selected.article} ${selected.name}`)],
      });
    }

    if (selected.account_locked)
      return send({ embeds: [new ErrorEmbed("this item cant be traded")] });

    embed.setDescription(`how many ${selected.emoji} ${selected.name} do you want to sell?`);

    await edit({ embeds: [embed], components: [] }, msg);

    const filter = (m: Message) => m.author.id == message.author.id;

    let fail = false;
    let res = await msg.channel
      .awaitMessages({ filter, time: 30000, max: 1 })
      .then(async (m) => {
        await m.first().delete();
        return m.first().content;
      })
      .catch(async () => {
        fail = true;
        embed.setDescription("❌ expired");
        edit({ embeds: [embed] }, msg);
      });

    if (fail) return;
    if (!res) return;

    if (res.toLowerCase() === "all") {
      res = inventory.find((i) => i.item == selected.id).amount.toString();
    }

    if (!parseInt(res)) {
      fail = true;
    }

    if (isNaN(parseInt(res))) {
      fail = true;
    }

    if (parseInt(res) < 1) {
      fail = true;
    }

    if (fail) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (!inventory.find((i) => i.item == selected.id)) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`you do not have this many ${selected.name}`)],
      });
    }

    if (inventory.find((i) => i.item == selected.id).amount < parseInt(res)) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`you do not have this many ${selected.name}`)],
      });
    }

    const amount = parseInt(res);

    embed.setDescription(
      `how much do you want to sell ${amount}x ${selected.emoji} ${selected.name} for?`,
    );

    await edit({ embeds: [embed], components: [] }, msg);

    res = await msg.channel
      .awaitMessages({ filter, time: 30000, max: 1 })
      .then(async (m) => {
        await m.first().delete();
        return m.first().content;
      })
      .catch(async () => {
        fail = true;
        embed.setDescription("❌ expired");
        edit({ embeds: [embed] }, msg);
      });

    if (fail) return;
    if (!res) return;

    if (!parseInt(res)) {
      fail = true;
    }

    if (isNaN(parseInt(res))) {
      fail = true;
    }

    if (parseInt(res) < 1) {
      fail = true;
    }

    if (fail) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    const cost = await formatBet(res.toLowerCase(), message.member).catch(() => {});

    if (!cost) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (cost <= 0) {
      return message.channel.send({
        embeds: [new ErrorEmbed("invalid amount")],
      });
    }

    if (
      cost > Constants.MAX_AUCTION_PER_ITEM * amount &&
      selected.rarity < 3 &&
      (selected.in_crates || ["prey", "fish", "ore", "sellable"].includes(selected.role))
    ) {
      return send({
        embeds: [
          new ErrorEmbed(
            `the maximum cost per item is $${Constants.MAX_AUCTION_PER_ITEM.toLocaleString()}`,
          ),
        ],
      });
    } else if (cost > 10_000_000_000)
      return send({
        embeds: [new ErrorEmbed("the maximum cost per item is $10,000,000,000")],
      });

    const shopCost = (items[selected.id].buy || 0) * amount;

    if (shopCost != 0 && cost > shopCost) {
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            `you can buy ${amount}x ${selected.emoji} ${
              selected.name
            } from nypsi's shop for $${shopCost.toLocaleString()}`,
          ),
        ],
      });
    }

    let max = 1;

    if (await isPremium(message.member)) {
      max += await getTier(message.member);
    }

    const itemValue = await calcItemValue(selected.id);

    if (cost / amount < itemValue / 2) {
      embed.setDescription(
        `**are you sure you want to auction at this price?**\nyou are selling this item for $${Math.floor(cost / amount).toLocaleString()} each\nthe average worth for this item is $${itemValue.toLocaleString()}`,
      );

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("✅").setLabel("confirm").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("❌").setLabel("cancel").setStyle(ButtonStyle.Danger),
      );

      msg.edit({ embeds: [embed], components: [row] });

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const reaction = await msg.awaitMessageComponent({ filter, time: 15000 }).catch(async () => {
        await msg.edit({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Danger)
                .setLabel("expired")
                .setCustomId("boobies")
                .setDisabled(true),
            ),
          ],
        });
        addExpiry(cmd.name, message.member, 30);
      });

      if (!reaction) return;

      if (reaction.customId === "❌") {
        msg.edit({ components: [] });
        return reaction.reply({
          embeds: [new CustomEmbed(message.member, "✅ cancelled")],
          ephemeral: true,
        });
      }
    }

    inventory = await getInventory(message.member);

    if (
      !inventory.find((i) => i.item == selected.id) ||
      inventory.find((i) => i.item == selected.id).amount < amount
    ) {
      return message.channel.send({ embeds: [new CustomEmbed(message.member, "sneaky bitch")] });
    }

    const auctions = await getAuctions(message.member);

    if (auctions.length >= max)
      return message.channel.send({ embeds: [new CustomEmbed(message.member, "sneaky bitch")] });

    await setInventoryItem(
      message.member,
      selected.id,
      inventory.find((i) => i.item == selected.id).amount - amount,
    );

    const url = await createAuction(message.member, selected.id, amount, cost).catch(() => {});

    if (url) {
      embed.setDescription(`[your auction has been created](${url})`);
    } else {
      embed.setDescription("there was an error while creating your auction");
    }

    return await edit({ embeds: [embed], components: [] }, msg);
  };

  const manageAuctions = async (msg?: NypsiMessage) => {
    const auctions = await getAuctions(message.member);

    const embed = new CustomEmbed(message.member).setHeader(
      "your auctions",
      message.author.avatarURL(),
    );

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    let currentPage = 0;
    const maxPage = auctions.length - 1;

    const displayAuction = (page: number) => {
      embed.setFields(
        {
          name: "item",
          value: `**${auctions[page].itemAmount}x** ${items[auctions[page].itemId].emoji} ${
            items[auctions[page].itemId].name
          }`,
          inline: true,
        },
        {
          name: "cost",
          value: `$**${auctions[page].bin.toLocaleString()}**`,
          inline: true,
        },
        {
          name: "created",
          value: `<t:${Math.floor(auctions[page].createdAt.getTime() / 1000)}:R>`,
          inline: true,
        },
      );
      embed.setFooter({ text: `page ${page + 1}/${maxPage + 1}` });
    };

    const updateButtons = async (page: number) => {
      if (auctions.length > 0) {
        row.setComponents(
          new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger),
        );

        if (auctions.length == 1) {
          row.components[0].setDisabled(true);
          row.components[1].setDisabled(true);
        } else {
          if (page === 0) {
            row.components[0].setDisabled(true);
          } else if (page === auctions.length - 1) {
            row.components[1].setDisabled(true);
          }
        }

        if (
          dayjs(auctions[page].createdAt).isAfter(
            dayjs().subtract((await isPremium(message.author.id)) ? 1 : 12, "hour"),
          )
        ) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId("bump")
              .setLabel("bump")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
        } else {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId("bump")
              .setLabel("bump")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(false),
          );
        }
      }

      let max = 1;

      if (await isPremium(message.member)) {
        max += await getTier(message.member);
      }

      if (auctions.length < max) {
        row.addComponents(
          new ButtonBuilder()
            .setLabel("create auction")
            .setCustomId("y")
            .setStyle(ButtonStyle.Success),
        );
      }
    };

    if (auctions.length == 0) {
      embed.setDescription("you don't currently have any auctions");
    } else if (auctions.length > 1) {
      displayAuction(0);
    } else {
      row.addComponents(
        new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger),
      );
      displayAuction(0);
    }

    await updateButtons(0);

    if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [row] });
    } else {
      msg = (await send({ embeds: [embed], components: [row] })) as NypsiMessage;
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
          await edit({ embeds: [embed], components: [] }, msg);
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "y") {
        return createAuctionProcess(msg);
      } else if (res == "⬅") {
        if (currentPage == 0) {
          return pageManager();
        }

        currentPage--;

        displayAuction(currentPage);

        await updateButtons(currentPage);

        await edit({ embeds: [embed], components: [row] }, msg);
        return pageManager();
      } else if (res == "➡") {
        if (currentPage == maxPage) {
          return pageManager();
        }

        currentPage++;

        displayAuction(currentPage);
        await updateButtons(currentPage);

        await edit({ embeds: [embed], components: [row] }, msg);
        return pageManager();
      } else if (res == "del") {
        const res = await deleteAuction(
          auctions[currentPage].id,
          message.client as NypsiClient,
        ).catch(() => {});

        if (res) {
          await addInventoryItem(
            auctions[currentPage].ownerId,
            auctions[currentPage].itemId,
            Number(auctions[currentPage].itemAmount),
          );

          await interaction.followUp({
            embeds: [new CustomEmbed(message.member, "✅ your auction has been deleted")],
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            embeds: [new CustomEmbed(message.member, "failed to delete that auction")],
            ephemeral: true,
          });
        }

        return manageAuctions(msg);
      } else if (res === "bump") {
        const bumpRes = await bumpAuction(auctions[currentPage].id, message.client as NypsiClient);

        if (!bumpRes) {
          await interaction.followUp({
            embeds: [new ErrorEmbed("this auction has already been bumped recently")],
            ephemeral: true,
          });
          displayAuction(currentPage);
          await updateButtons(currentPage);
          await msg.edit({ embeds: [embed], components: [row] });
          return pageManager();
        } else {
          await interaction.followUp({
            embeds: [new CustomEmbed(message.member, `[your auction has been bumped](${bumpRes})`)],
            ephemeral: true,
          });
          displayAuction(currentPage);
          await updateButtons(currentPage);
          await msg.edit({ embeds: [embed], components: [row] });
          return pageManager();
        }
      }
    };

    return pageManager();
  };

  if (args[0]?.toLowerCase() === "create") args.shift();

  if (args.length == 0 || args[0].toLowerCase() == "manage") {
    return manageAuctions();
  } else if (args[0].toLowerCase() == "del") {
    if (message.guild.id != "747056029795221513") return;

    const roles = message.member.roles.cache;

    let allow = false;

    if (roles.has("747056620688900139")) allow = true;
    if (roles.has("747059949770768475")) allow = true;
    if (roles.has("845613231229370429")) allow = true;
    if (roles.has("1105179633919471707")) allow = true;

    if (!allow) return;

    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed("use the message id dumbass")] });
    }

    const auction = await prisma.auction.findUnique({
      where: {
        messageId: args[1],
      },
    });

    if (!auction) return message.channel.send({ embeds: [new ErrorEmbed("invalid auction bro")] });

    logger.info(
      `admin: ${message.author.id} (${message.author.username}) deleted auction`,
      auction,
    );

    if (auction.sold) {
      await prisma.auction.delete({
        where: {
          messageId: auction.messageId,
        },
      });
    } else {
      await deleteAuction(auction.id, message.client as NypsiClient);

      if (!(await userExists(auction.ownerId))) return;

      await addInventoryItem(auction.ownerId, auction.itemId, Number(auction.itemAmount));

      if ((await getDmSettings(auction.ownerId)).auction) {
        const embed = new CustomEmbed().setColor(Constants.TRANSPARENT_EMBED_COLOR);

        embed.setDescription(
          `your auction for ${auction.itemAmount}x ${items[auction.itemId].emoji} ${
            items[auction.itemId].name
          } has been removed by a staff member. you have been given back your item${
            auction.itemAmount > 1 ? "s" : ""
          }`,
        );

        if (args.length > 2) {
          args.splice(0, 2);
          embed.addField("reason", args.join(" "));
        }

        addNotificationToQueue({
          memberId: auction.ownerId,
          payload: { embed: embed, content: "your auction has been removed by a staff member" },
        });
      }
    }

    await (message as Message).react("✅");

    return;
  } else if (args[0].toLowerCase() == "watch") {
    let current = await getAuctionWatch(message.member);
    let max = 5;

    if (await isPremium(message.member)) max *= await getTier(message.member);

    if (current.length > max)
      current = await setAuctionWatch(message.member, current.splice(0, max));

    const items = getItems();

    if (args.length == 1) {
      if (current.length == 0) {
        return send({
          embeds: [
            new CustomEmbed(message.member, "you are not currently watching for any auctions"),
          ],
        });
      }

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `you are currently watching: \n\n${current
              .map(
                (i) =>
                  `- ${items[i.itemId].emoji} ${items[i.itemId].name}${
                    i.maxCost > 0 ? `: $${i.maxCost.toLocaleString()}` : ""
                  }`,
              )
              .join("\n")}`,
          ).setHeader("auction watch", message.author.avatarURL()),
        ],
      });
    }

    const selected = selectItem(args[1].toLowerCase());

    if (!selected) {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
    }

    let desc = "";

    if (current.find((i) => i.itemId === selected.id) && !args[2]) {
      desc = `✅ removed ${selected.emoji} ${selected.name}`;

      current = await deleteAuctionWatch(message.member, selected.id);
    } else {
      if (current.length >= max && !current.find((i) => i.itemId === selected.id)) {
        let desc = `you have reached the limit of auction watches (**${max}**)`;

        if (max == 1) {
          desc += "\n\nyou can upgrade this with premium membership (`/premium`)";
        }

        return send({ embeds: [new ErrorEmbed(desc)] });
      }

      desc = `✅ added ${selected.emoji} ${selected.name}`;

      current = await updateAuctionWatch(
        message.member,
        selected.id,
        args[2] ? formatNumber(args[2]) : undefined,
      );
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      "auction watch",
      message.author.avatarURL(),
    );

    if (current.length > 0) {
      embed.addField(
        "currently watching",
        current
          .map(
            (i) =>
              `- ${items[i.itemId].emoji} ${items[i.itemId].name}${
                i.maxCost > 0 ? `: $${i.maxCost.toLocaleString()}` : ""
              }`,
          )
          .join("\n"),
      );
    }

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase().includes("search") || args[0].toLowerCase().includes("find")) {
    if (args.length === 1) return send({ embeds: [new ErrorEmbed("/auction search <item>")] });

    const item = selectItem(args.slice(1).join(" "));

    if (!item) return send({ embeds: [new ErrorEmbed("invalid item")] });

    const auctions = await findAuctions(item.id);

    if (auctions.length === 0)
      return send({ embeds: [new ErrorEmbed(`no auctions found for ${item.name}`)] });

    const pages = PageManager.createPages(
      auctions.map(
        (a) =>
          `**${a.itemAmount}x** ${items[a.itemId].emoji} ${items[a.itemId].name}\n` +
          `- $**${a.bin.toLocaleString()}**${
            a.itemAmount > 1
              ? ` ($${Math.floor(Number(a.bin / a.itemAmount)).toLocaleString()} each)`
              : ""
          }\n` +
          `- [jump](https://discord.com/channels/747056029795221513/1008467335973179482/${a.messageId})\n`,
      ),
      3,
    );

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n")).setHeader(
      `current auctions for ${item.name}`,
      message.author.avatarURL(),
    );

    if (pages.size === 1) {
      return send({ embeds: [embed] });
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      embed,
      message: msg,
      row,
      userId: message.author.id,
      pages,
    });

    return manager.listen();
  } else {
    let maxAuctions = 1;

    if (await isPremium(message.member)) {
      maxAuctions += await getTier(message.member);
    }

    const auctions = await getAuctions(message.member);

    if (auctions.length >= maxAuctions) {
      return send({
        embeds: [
          new ErrorEmbed(`you have reached your maximum (\`${maxAuctions}\`) amount of auctions`),
        ],
      });
    }

    const items = getItems();

    const selected = selectItem(args[0].toLowerCase());

    if (!selected) {
      return send({ embeds: [new ErrorEmbed("couldnt find that item")] });
    }

    let inventory = await getInventory(message.member);

    if (
      !inventory.find((i) => i.item == selected.id) ||
      inventory.find((i) => i.item == selected.id).amount == 0
    ) {
      return send({
        embeds: [new ErrorEmbed(`you dont have ${selected.article} ${selected.name}`)],
      });
    }

    if (selected.account_locked)
      return send({ embeds: [new ErrorEmbed("this item cant be traded")] });

    let amount = 1;

    if (args.length === 3) {
      if (args[1].toLowerCase() == "all") {
        args[1] = inventory.find((i) => i.item == selected.id).amount.toString();
      }

      if (!parseInt(args[1]) || isNaN(parseInt(args[1]))) {
        return send({ embeds: [new ErrorEmbed("invalid amount")] });
      }

      amount = parseInt(args[1]);
    }

    if (amount < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (
      !inventory.find((i) => i.item === selected.id) ||
      inventory.find((i) => i.item == selected.id).amount < amount
    ) {
      return send({ embeds: [new ErrorEmbed(`you dont have this many ${selected.name}`)] });
    }

    const cost = formatNumber(args.length === 2 ? args[1] : args[2]);

    if (!cost) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (cost <= 0) {
      return send({
        embeds: [new ErrorEmbed("invalid amount")],
      });
    }

    if (
      cost > Constants.MAX_AUCTION_PER_ITEM * amount &&
      selected.rarity < 3 &&
      (selected.in_crates || ["prey", "fish", "ore", "sellable"].includes(selected.role))
    ) {
      return send({
        embeds: [
          new ErrorEmbed(
            `the maximum cost per item is $${Constants.MAX_AUCTION_PER_ITEM.toLocaleString()}`,
          ),
        ],
      });
    } else if (cost > 10_000_000_000)
      return send({
        embeds: [new ErrorEmbed("the maximum cost per item is $10,000,000,000")],
      });

    const shopCost = (items[selected.id].buy || 0) * amount;

    if (shopCost != 0 && cost > shopCost) {
      return send({
        embeds: [
          new ErrorEmbed(
            `you can buy ${amount}x ${selected.emoji} ${
              selected.name
            } from nypsi's shop for $${shopCost.toLocaleString()}`,
          ),
        ],
      });
    }

    const itemValue = await calcItemValue(selected.id);

    let msg: Message<boolean>;

    if (cost / amount < itemValue / 2) {
      const embed = new CustomEmbed(message.member).setHeader(
        "create an auction",
        message.author.avatarURL(),
      );

      embed.setDescription(
        `**are you sure you want to auction at this price?**\nyou are selling this item for $${Math.floor(cost / amount).toLocaleString()} each\nthe average worth for this item is $${itemValue.toLocaleString()}`,
      );

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("✅").setLabel("confirm").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("❌").setLabel("cancel").setStyle(ButtonStyle.Danger),
      );

      msg = await send({ embeds: [embed], components: [row] });

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const reaction = await msg.awaitMessageComponent({ filter, time: 15000 }).catch(async () => {
        await msg.edit({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Danger)
                .setLabel("expired")
                .setCustomId("boobies")
                .setDisabled(true),
            ),
          ],
        });
        addExpiry(cmd.name, message.member, 30);
      });

      if (!reaction) return;

      if (reaction.customId === "❌") {
        msg.edit({ components: [] });
        return reaction.reply({
          embeds: [new CustomEmbed(message.member, "✅ cancelled")],
          ephemeral: true,
        });
      }

      inventory = await getInventory(message.member);

      if (
        !inventory.find((i) => i.item == selected.id) ||
        inventory.find((i) => i.item == selected.id).amount < amount
      ) {
        return await reaction.reply({ embeds: [new CustomEmbed(message.member, "sneaky bitch")] });
      }
    }

    await setInventoryItem(
      message.member,
      selected.id,
      inventory.find((i) => i.item == selected.id).amount - amount,
    );

    const url = await createAuction(message.member, selected.id, amount, cost).catch((e) => {
      console.log(e);
    });

    let desc: string;

    if (url) {
      desc = `[your auction has been created](${url})`;
    } else {
      desc = "there was an error while creating your auction";
    }

    if (msg) {
      return await edit(
        {
          embeds: [
            new CustomEmbed(message.member, desc).setHeader(
              "create an auction",
              message.author.avatarURL(),
            ),
          ],
          components: [],
        },
        msg,
      );
    }
    return await send({ embeds: [new CustomEmbed(message.member, desc)] });
  }
}

cmd.setRun(run);

module.exports = cmd;
