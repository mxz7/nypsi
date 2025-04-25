import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  APIMessageComponentEmoji,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import {
  checkMarketOverlap,
  checkMarketWatchers,
  deleteMarketOrder,
  deleteMarketWatch,
  getMarketItemOrders,
  getMarketOrders,
  getMarketWatch,
  getPriceForMarketTransaction,
  marketBuy,
  marketSell,
  setMarketWatch,
  updateMarketWatch,
} from "../utils/functions/economy/market";
import {
  addInventoryItem,
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
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { NypsiClient } from "../models/Client";
import { addBalance, getBalance, removeBalance } from "../utils/functions/economy/balance";
import { getEmojiImage } from "../utils/functions/image";
import { Item } from "../types/Economy";
import { OrderType } from "@prisma/client";

const cmd = new Command("market", "create and manage your orders on the market", "money").setAliases(["mk"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((manage) =>
    manage.setName("manage").setDescription("manage your buy and sell orders"),
  )
  .addSubcommand((create) =>
    create
      .setName("create")
      .setDescription("create a buy or sell order")
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("which item?")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("order-type")
          .setDescription("do you want to buy or sell this item?")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("how many of this item?")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("price")
          .setDescription("how much do you want to sell each item for?")
          .setRequired(true),
      )
  )
  .addSubcommand((view) =>
    view
      .setName("search")
      .setDescription("search the market for an item")
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("item to search the market for")
          .setAutocomplete(true)
          .setRequired(true),
      ),
  )
  .addSubcommand((buy) =>
    buy
      .setName("buy")
      .setDescription("buy from the market")
      .addStringOption((option) =>
        option
          .setName("item-market-buy")
          .setDescription("which do you want to buy?")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("how many of this item?")
          .setRequired(true),
      )
  )
  .addSubcommand((sell) =>
    sell
      .setName("sell")
      .setDescription("sell to the market")
      .addStringOption((option) =>
        option
          .setName("item-market-sell")
          .setDescription("which do you want to sell?")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("amount")
          .setDescription("how many of this item?")
          .setRequired(true),
      )
  )
  .addSubcommand((watch) =>
    watch
      .setName("watch")
      .setDescription("receive notifications when a sell offer is created for chosen items")
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("item you want to toggle on/off")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("order-type")
          .setDescription("are you watching for a buy order or sell order?")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("price")
          .setDescription("min/max price you want to be notified for")
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
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
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
      return await message.editReply(data as InteractionEditReplyOptions);
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

  await addCooldown(cmd.name, message.member, 3);

  if (message.author.createdTimestamp > dayjs().subtract(1, "day").valueOf()) {
    return send({
      embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
    });
  }

  if ((await getRawLevel(message.member)) < 1) {
    return send({
      embeds: [new ErrorEmbed("you must be level 1 before you can access the market")],
    });
  }

  const items = getItems();

  const viewMarket = async (viewRecent = true, msg?: NypsiMessage) => {
    
    const buyOrders = viewRecent ? await prisma.marketOrder.findMany({
      where: { AND: [{ completed: false }, { orderType: "buy" }]},
      orderBy: { createdAt: "desc" },
      take: 5,
    }) : await prisma.marketOrder.findMany({
      where: { AND: [{ completed: false }, { orderType: "buy" }, { ownerId: message.member.id }]},
      orderBy: { createdAt: "desc" },
    });
    
    const sellOrders = viewRecent ? await prisma.marketOrder.findMany({
      where: { AND: [{ completed: false }, { orderType: "sell" }]},
      orderBy: { createdAt: "desc" },
      take: 5,
    }) : await prisma.marketOrder.findMany({
      where: { AND: [{ completed: false }, { orderType: "sell" }, { ownerId: message.member.id }]},
      orderBy: { createdAt: "desc" },
    });

    
    const embed = new CustomEmbed(message.member).setHeader(
      "the market",
      message.author.avatarURL(),
    );

    embed.setDescription(viewRecent ? "most recent orders" : "your orders");

    embed.setFields(
      {
        name: "buy orders",
        value: `${buyOrders.length == 0 ? "none" : buyOrders.map((b) => `- **${b.itemAmount.toLocaleString()}x** ${items[b.itemId].emoji} ${
          items[b.itemId].name} @ $${b.price.toLocaleString()} ea.`).join("\n")}`,
        inline: true,
      },
      {
        name: "sell orders",
        value: `${sellOrders.length == 0 ? "none" : sellOrders.map((b) => `- **${b.itemAmount.toLocaleString()}x** ${items[b.itemId].emoji} ${
          items[b.itemId].name} @ $${b.price.toLocaleString()} ea.`).join("\n")}`,
        inline: true,
      },
    );

    const topRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("viewRecent").setLabel("recent orders").setStyle(viewRecent ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("viewOwn").setLabel("your orders").setStyle(viewRecent ? ButtonStyle.Secondary : ButtonStyle.Success),
    );

    const bottomRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("mBuy").setLabel("manage buy orders").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("mSell").setLabel("manage sell orders").setStyle(ButtonStyle.Primary),
    );

    if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [topRow, bottomRow] });
    } else {
      msg = (await send({ embeds: [embed], components: [topRow, bottomRow] })) as NypsiMessage;
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

      const { res } = response;

      if (res == "mBuy") {
        return manageOrders("buy", msg);
      } else if (res == "mSell") {
        return manageOrders("sell", msg);
      } else if (res == "viewRecent") {
        return viewMarket(true, msg);
      } else if (res == "viewOwn") {
        return viewMarket(false, msg);
      }
    };

    return pageManager();

  }

  const manageOrders = async (type: OrderType, msg?: NypsiMessage) => {    
    const embed = new CustomEmbed(message.member).setHeader(
      `${type} orders`,
      message.author.avatarURL(),
    );    

    let orders = await prisma.marketOrder.findMany({
      where: {
        AND: [{ ownerId: message.member.id }, { completed: false }, { orderType: type }],
      },
      orderBy: { createdAt: "desc" },
    });

    const updateEmbed = async() => {
      orders = await prisma.marketOrder.findMany({
        where: {
          AND: [{ ownerId: message.member.id }, { completed: false }, { orderType: type }],
        },
        orderBy: { createdAt: "desc" },
      });

      embed.setFields({
          name: `your ${type} orders`,
          value: `${orders.length == 0 ? "none" : orders.map((b) => `- **${b.itemAmount.toLocaleString()}x** ${items[b.itemId].emoji} ${items[b.itemId].name} @ $${b.price.toLocaleString()} ea.`).join("\n")}`,
      });
  
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("newOrder").setLabel("create order").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("delOrder").setLabel("delete order").setStyle(ButtonStyle.Danger).setDisabled(orders.length == 0),
      );
  
      const bottomRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("b").setLabel("back").setStyle(ButtonStyle.Secondary),
      );
  
      if (msg) {
        msg = await msg.edit({ embeds: [embed], components: [row, bottomRow] });
      } else {
        msg = (await send({ embeds: [embed], components: [row, bottomRow] })) as NypsiMessage;
      }
    }

    await updateEmbed();
    
    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          if (collected.customId !== "newOrder")
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

      if (res == "newOrder") {
        const res = await createOrderModal(type, interaction as ButtonInteraction);

        if (res) {
          await res.deferReply({ ephemeral: true });
          
          const item = res.fields.fields.get("item").value;
          const amount = res.fields.fields.get("amount").value;
          const price = res.fields.fields.get("price").value;

          const selected = selectItem(item);

          if (!selected || selected.account_locked) {
            await res.editReply({
              embeds: [new ErrorEmbed("couldnt find that item")],
              options: { ephemeral: true },
            });
            await updateEmbed();
            return pageManager();
          } else if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
            await res.editReply({
              embeds: [new ErrorEmbed("invalid amount")],
              options: { ephemeral: true },
            });
            await updateEmbed();
            return pageManager();
          } else if (!parseInt(price) || isNaN(parseInt(price)) || parseInt(price) < 1) {
            await res.editReply({
              embeds: [new ErrorEmbed("invalid price")],
              options: { ephemeral: true },
            });
            await updateEmbed();
            return pageManager();
          }
          
          const cost = await formatBet(price.toLowerCase(), message.member).catch(() => {});
          
          if (!cost) {
            await res.editReply({
              embeds: [new ErrorEmbed("invalid price")],
              options: { ephemeral: true },
            });
            await updateEmbed();
            return pageManager();
          }
          
          if (type == "buy") {

            if ((await getBalance(message.member)) < parseInt(amount) * cost) {
              await res.editReply({
                embeds: [new ErrorEmbed("you dont have enough money")],
                options: { ephemeral: true },
              });
              await updateEmbed();
              return pageManager();
            }

            const userItemSellOrders = (await getMarketOrders(message.member, "sell")).filter((i) => i.itemId = selected.id);

            if (userItemSellOrders && userItemSellOrders.reduce((a, b) => a.price < b.price ? a : b).price < cost) {
              await res.editReply({
                embeds: [new ErrorEmbed("you cannot make a buy order for more than your lowest sell order for this item")],
                options: { ephemeral: true },
              });
              await updateEmbed();
              return pageManager();
            }

            await removeBalance(message.member, parseInt(amount) * cost);

            await prisma.marketOrder.create({
              data: {
                ownerId: message.member.id,
                itemId: selected.id,
                itemAmount: parseInt(amount),
                price: cost,
                orderType: "buy",
              },
            });

            await checkMarketOverlap(message.member, selected.id, type);
            await checkMarketWatchers(selected.id, parseInt(amount), message.member.id, type, cost);
            
            await res.editReply({ embeds: [new CustomEmbed(message.member, "✅ your buy order has been created")], options: { ephemeral: true }});
          }
          else if (type == "sell") {
            const inventory = await getInventory(message.member);

            if (
              !inventory.find((i) => i.item == selected.id) ||
              inventory.find((i) => i.item == selected.id).amount < parseInt(amount)
            ) {
            
              await res.editReply({
                embeds: [new ErrorEmbed(`you dont have enough ${selected.plural ? selected.plural : selected.name}`)],
                options: { ephemeral: true },
              });
              await updateEmbed();
              return pageManager();
            }

            const userItemBuyOrders = (await getMarketOrders(message.member, "buy")).filter((i) => i.itemId = selected.id);

            if (userItemBuyOrders && userItemBuyOrders.reduce((a, b) => a.price > b.price ? a : b).price > cost) {
              await res.editReply({
                embeds: [new ErrorEmbed("you cannot make a sell order for less than your highest buy order for this item")],
                options: { ephemeral: true },
              });
              await updateEmbed();
              return pageManager();
            }

            await setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - parseInt(amount));

            await prisma.marketOrder.create({
              data: {
                ownerId: message.member.id,
                itemId: selected.id,
                itemAmount: parseInt(amount),
                price: cost,
                orderType: "sell",
              },
            });

            await checkMarketOverlap(message.member, selected.id, type);
            await checkMarketWatchers(selected.id, parseInt(amount), message.member.id, type, cost);
            
            await res.editReply({ embeds: [new CustomEmbed(message.member, "✅ your sell order has been created")], options: { ephemeral: true }});
          }
        }

        await updateEmbed();
        return pageManager();
      } else if (res == "delOrder") {
        const res = orders.length == 1 ? orders[0].id.toString() : await deleteOrder(type, msg, orders);

        if (res) {

          const order = await prisma.marketOrder.findFirst({ where: { AND: [{ id: parseInt(res) }, { completed: false }, { orderType: type }] } });

          const result = await deleteMarketOrder(parseInt(res), message.client as NypsiClient);

          if (result) {
            if (type == "buy") {
              await addBalance(message.member, Number(order.itemAmount * order.price));
            } else {
              await addInventoryItem(message.member, order.itemId, Number(order.itemAmount));
            }
          }
        }

        await updateEmbed();
        return pageManager();
      } else if (res == "b") {
        return viewMarket(true, msg);
      }
    };

    return pageManager();
  }

  async function createOrderModal(type: string, interaction: ButtonInteraction) {
    const id = `market-${type}-order-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder().setCustomId(id).setTitle(`create ${type} order`);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("item")
          .setLabel(`what item do you want to ${type}?`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(25),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("how many of this item?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("price")
          .setLabel(`how much do you want to ${type} each item for?`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10),
      ),
    );

    await interaction.showModal(modal);

    const filter = (i: ModalSubmitInteraction) =>
      i.user.id == interaction.user.id && i.customId === id;

    return await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});
  }

  const deleteOrder = async (type: string, msg: NypsiMessage, orders: { itemId: string; itemAmount: bigint; price: bigint; id: number }[]) => {
    const embed = new CustomEmbed(message.member).setHeader(
      `delete ${type} order`,
      message.author.avatarURL(),
    );

    embed.setDescription(`which ${type} order would you like to delete?`);

    const items = getItems();

    const options: StringSelectMenuOptionBuilder[] = [];

    for (const order of orders) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setValue(order.id.toString())
          .setEmoji(items[order.itemId].emoji as APIMessageComponentEmoji)
          .setLabel(`${order.itemAmount.toLocaleString()}x ${items[order.itemId].name} @ $${order.price.toLocaleString()} ea.`),
      );
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("order")
        .setPlaceholder("order you want to delete")
        .setOptions(options),
    );

    const backRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("back").setLabel("back").setStyle(ButtonStyle.Danger),
    );

    await edit({ embeds: [embed], components: [row, backRow] }, msg);

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

    return res;
  };

  if (args.length == 0) {
    return viewMarket();
  } else if (args[0].toLowerCase() == "watch") {
    let currentBuy = (await getMarketWatch(message.member)).filter((i) => i.orderType == "buy");
    let currentSell = (await getMarketWatch(message.member)).filter((i) => i.orderType == "sell");
    let max = 5;

    if (await isPremium(message.member)) max *= await getTier(message.member);

    if (currentBuy.length > max)
      currentBuy = await setMarketWatch(message.member, currentBuy.splice(0, max));

    if (currentSell.length > max)
      currentSell = await setMarketWatch(message.member, currentSell.splice(0, max));

    const items = getItems();

    if (args.length == 1) {
      if (currentBuy.length == 0 && currentSell.length == 0) {
        return send({
          embeds: [
            new CustomEmbed(message.member, "you are not currently watching for any orders"),
          ],
        });
      }

      const embed = new CustomEmbed(
        message.member,
        `you are currently watching: \n`
      ).setHeader("market watch", message.author.avatarURL());

      
      embed.setFields(
        {
          name: "buy orders",
          value: `${currentBuy.length == 0 ? "none" : currentBuy
            .map(
              (i) =>
                `- ${items[i.itemId].emoji} ${items[i.itemId].name}${
                  i.priceThreshold > 0 ? `: min of $${i.priceThreshold.toLocaleString()}` : ""
                }`,
            ).join("\n")}`,
          inline: true,
        },
        {
          name: "sell orders",
          value: `${currentSell.length == 0 ? "none" : currentSell
            .map(
              (i) =>
                `- ${items[i.itemId].emoji} ${items[i.itemId].name}${
                  i.priceThreshold > 0 ? `: max of $${i.priceThreshold.toLocaleString()}` : ""
                }`,
            ).join("\n")}`,
          inline: true,
        },
      );

      return send({embeds: [embed]});
    }

    const selected = selectItem(args[1].toLowerCase());

    if (!selected) {
      if (args[1].toLowerCase() === "clear") {
        await setMarketWatch(message.member, []);
        return send({
          embeds: [new CustomEmbed(message.member, "✅ your market watch has been cleared")],
        });
      }

      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
    }

    let desc = "";

    if (args.length == 2) {
      if (currentBuy.find((i) => i.itemId === selected.id)) {

        desc = `✅ removed ${selected.emoji} ${selected.name}`;

        currentBuy = await deleteMarketWatch(message.member, "buy", selected.id);
      }

      if (currentSell.find((i) => i.itemId === selected.id)) {

        desc = `✅ removed ${selected.emoji} ${selected.name}`;

        currentSell = await deleteMarketWatch(message.member, "sell", selected.id);
      }

      if (desc == "") return send({
        embeds: [new ErrorEmbed("/market watch <item> <buy/sell> <amount>")],
      });
    } else {

      let type: OrderType;

      if (args[2].startsWith("b")) type = "buy";
      else if (args[2].startsWith("s")) type = "sell";
      else return send({
        embeds: [new ErrorEmbed("invalid order type (buy/sell)")],
      });

      if ((type == "buy" ? currentBuy : currentSell).length >= max && !(type == "buy" ? currentBuy : currentSell).find((i) => i.itemId === selected.id)) {
        let desc = `you have reached the limit of ${type} order market watches (**${max}**)`;

        if (max == 1) {
          desc += "\n\nyou can upgrade this with premium membership (`/premium`)";
        }

        return send({ embeds: [new ErrorEmbed(desc)] });
      }

      desc = `✅ added ${selected.emoji} ${selected.name}`;

      if (type == "buy") {
        currentBuy = (await updateMarketWatch(
          message.member,
          selected.id,
          type,
          args[3] ? formatNumber(args[3]) : undefined,
        )).filter((i) => i.orderType == type);
      } else {
        currentSell = (await updateMarketWatch(
          message.member,
          selected.id,
          type,
          args[3] ? formatNumber(args[3]) : undefined,
        )).filter((i) => i.orderType == type);
      }
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      "market watch",
      message.author.avatarURL(),
    );

    if (currentBuy.length > 0 || currentSell.length > 0) {
      embed.setFields(
        {
          name: "buy orders",
          value: `${currentBuy.length == 0 ? "none" : currentBuy
            .map(
              (i) =>
                `- ${items[i.itemId].emoji} ${items[i.itemId].name}${
                  i.priceThreshold > 0 ? `: min of $${i.priceThreshold.toLocaleString()}` : ""
                }`,
            ).join("\n")}`,
          inline: true,
        },
        {
          name: "sell orders",
          value: `${currentSell.length == 0 ? "none" : currentSell
            .map(
              (i) =>
                `- ${items[i.itemId].emoji} ${items[i.itemId].name}${
                  i.priceThreshold > 0 ? `: max of $${i.priceThreshold.toLocaleString()}` : ""
                }`,
            ).join("\n")}`,
          inline: true,
        },
      );

    }

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase().includes("search") || args[0].toLowerCase().includes("find") || args[0].toLowerCase().includes("view")) {
    if (args.length === 1) return send({ embeds: [new ErrorEmbed("/market search <item>")] });

    const item = selectItem(args.slice(1).join(" "));

    if (!item) return send({ embeds: [new ErrorEmbed("invalid item")] });

    return await itemView(item);
  } else if (args[0].toLowerCase().includes("buy")) {
    if (args.length === 1) return send({ embeds: [new ErrorEmbed("/market buy <item> <amount>")] });

    const item = selectItem(args[1]);

    if (!item) return send({ embeds: [new ErrorEmbed("invalid item")] });

    const amount = args[2] ?? "1";
    
    if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (await getPriceForMarketTransaction(item.id, parseInt(amount), "buy", message.member.id) == -1) {
      return send({ embeds: [new ErrorEmbed(`not enough ${item.plural ? item.plural : item.name} on the market`)] });
    }

    return await confirmTransaction("buy", item, parseInt(amount), message.member.id);
  } else if (args[0].toLowerCase().includes("sell")) {
    if (args.length === 1) return send({ embeds: [new ErrorEmbed("/market sell <item> <amount>")] });

    const item = selectItem(args[1]);

    if (!item) return send({ embeds: [new ErrorEmbed("invalid item")] });

    const amount = args[2] ?? "1";
    
    if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }
    
    if (await getPriceForMarketTransaction(item.id, parseInt(amount), "sell", message.member.id) == -1) {
      return send({ embeds: [new ErrorEmbed(`not enough ${item.plural ? item.plural : item.name} on the market`)] });
    }

    const inventory = await getInventory(message.member)
        
    if (
      !inventory.find((i) => i.item == item.id) ||
      inventory.find((i) => i.item == item.id).amount < 1
    ) {
      return send({
        embeds: [new ErrorEmbed(`you do not have this many ${item.plural ? item.plural : item.name}`)],
      });
    }

    return await confirmTransaction("sell", item, parseInt(amount), message.member.id);
  } else if (args[0].toLowerCase().includes("create") || args[0].toLowerCase() == "c") {
    if (args.length < 5) return send({ embeds: [new ErrorEmbed("/market create <item> <buy/sell> <amount> <price>")] });

    const [item, type, amount, price] = args.slice(1, 5);

    const selected = selectItem(item);

    if (type != "buy" && type != "sell") {
      return send({ embeds: [new ErrorEmbed("invalid order type (buy/sell)")] });
    }

    if (!selected || selected.account_locked) {
      return send({ embeds: [new ErrorEmbed("couldnt find that item")] });
    }
    
    if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }
    
    if (!parseInt(price) || isNaN(parseInt(price)) || parseInt(price) < 1) {
      return send({ embeds: [new ErrorEmbed("invalid price")] });
    }
    
    const cost = await formatBet(price.toLowerCase(), message.member).catch(() => {});
    
    if (!cost) return send({ embeds: [new ErrorEmbed("invalid price")] });
    
    if (type == "buy") {

      if ((await getBalance(message.member)) < parseInt(amount) * cost) {
        return send({ embeds: [new ErrorEmbed("you dont have enough money")] });
      }

      const userItemSellOrders = (await getMarketOrders(message.member, "sell")).filter((i) => i.itemId = selected.id);

      if (userItemSellOrders && userItemSellOrders.reduce((a, b) => a.price < b.price ? a : b).price < cost) {
        return send({ embeds: [new ErrorEmbed("you cannot make a buy order for more than your lowest sell order for this item")] });
      }

      await removeBalance(message.member, parseInt(amount) * cost);

      await prisma.marketOrder.create({
        data: {
          ownerId: message.member.id,
          itemId: selected.id,
          itemAmount: parseInt(amount),
          price: cost,
          orderType: "buy",
        },
      });

      await checkMarketOverlap(message.member, selected.id, type);
      await checkMarketWatchers(selected.id, parseInt(amount), message.member.id, type, cost);

      
      return send({ embeds: [new CustomEmbed(message.member, "✅ your buy order has been created")]});
    }
    else if (type == "sell") {
      const inventory = await getInventory(message.member);

      if (
        !inventory.find((i) => i.item == selected.id) ||
        inventory.find((i) => i.item == selected.id).amount < parseInt(amount)
      ) {
        return send({ embeds: [new ErrorEmbed(`you dont have enough ${selected.plural ? selected.plural : selected.name}`)] });
      }
      
      const userItemBuyOrders = (await getMarketOrders(message.member, "buy")).filter((i) => i.itemId = selected.id);

      if (userItemBuyOrders && userItemBuyOrders.reduce((a, b) => a.price > b.price ? a : b).price > cost) {
        return send({ embeds: [new ErrorEmbed("you cannot make a sell order for less than your highest buy order for this item")] });
      }

      await setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - parseInt(amount));

      await prisma.marketOrder.create({
        data: {
          ownerId: message.member.id,
          itemId: selected.id,
          itemAmount: parseInt(amount),
          price: cost,
          orderType: "sell",
        },
      });

      await checkMarketOverlap(message.member, selected.id, type);
      await checkMarketWatchers(selected.id, parseInt(amount), message.member.id, type, cost);
      
      return send({ embeds: [new CustomEmbed(message.member, "✅ your sell order has been created")]});
    }
  } else return viewMarket();

  async function itemView(item: Item, msg?: NypsiMessage) {
    const embed = new CustomEmbed(message.member).setHeader(
      `${item.name} market`,
      getEmojiImage(item.emoji),
    );

    const updateEmbed = async() => {
      const buyOrders = await getMarketItemOrders(item.id, "buy");
      const sellOrders = await getMarketItemOrders(item.id, "sell");

      const totalBuyOrderCount = buyOrders.reduce((sum, item) => sum + Number(item.itemAmount), 0);
      const totalSellOrderCount = sellOrders.reduce((sum, item) => sum + Number(item.itemAmount), 0);
  
      const formattedBuyOrders = buyOrders.reduce<{ itemAmount: number; price: number }[]>((acc, order) => {
        const existingItem = acc.find(item => item.price === Number(order.price));
    
        if (existingItem) {
            existingItem.itemAmount += Number(order.itemAmount);
        } else {
            acc.push({
                itemAmount: Number(order.itemAmount),
                price: Number(order.price),
            });
        }
    
        return acc;
      }, []);
      
      const formattedSellOrders = sellOrders.reduce<{ itemAmount: number; price: number }[]>((acc, order) => {
        const existingItem = acc.find(item => item.price === Number(order.price));
    
        if (existingItem) {
            existingItem.itemAmount += Number(order.itemAmount);
        } else {
            acc.push({
                itemAmount: Number(order.itemAmount),
                price: Number(order.price),
            });
        }
    
        return acc;
      }, []);
      
      const extraBuyOrderCount = formattedBuyOrders.slice(5).reduce((sum, item) => sum + Number(item.itemAmount), 0);
      const extraSellOrderCount = formattedSellOrders.slice(5).reduce((sum, item) => sum + Number(item.itemAmount), 0);
  
      embed.setFields(
        {
          name: "buy orders",
          value: `${buyOrders.length == 0 ? "none" : formattedBuyOrders.slice(0, 5).map((b) => `- **${b.itemAmount.toLocaleString()}x** ${item.emoji} ${
            item.name} @ $${b.price.toLocaleString()} ea.`).join("\n")}${extraBuyOrderCount > 0 ? `\n*+ ${extraBuyOrderCount} more items*` : ""}`,
          inline: true,
        },
        {
          name: "sell orders",
          value: `${sellOrders.length == 0 ? "none" : formattedSellOrders.slice(0, 5).map((b) => `- **${b.itemAmount.toLocaleString()}x** ${item.emoji} ${
            item.name} @ $${b.price.toLocaleString()} ea.`).join("\n")}${extraSellOrderCount > 0 ? `\n*+ ${extraSellOrderCount} more items*` : ""}`,
          inline: true,
        },
      );
  
      const topRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("buyOne").setLabel("buy one").setStyle(ButtonStyle.Primary).setDisabled(totalSellOrderCount == 0),
        new ButtonBuilder().setCustomId("buyMulti").setLabel("buy multiple").setStyle(ButtonStyle.Primary).setDisabled(totalSellOrderCount <= 1),
        new ButtonBuilder().setCustomId("refresh").setLabel("refresh").setStyle(ButtonStyle.Secondary),
      );
  
      const bottomRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("sellOne").setLabel("sell one").setStyle(ButtonStyle.Primary).setDisabled(totalBuyOrderCount == 0),
        new ButtonBuilder().setCustomId("sellMulti").setLabel("sell multiple").setStyle(ButtonStyle.Primary).setDisabled(totalBuyOrderCount <= 1),
      );
  
      if (msg) {
        msg = await msg.edit({ embeds: [embed], components: [topRow, bottomRow] });
      } else {
        msg = (await send({ embeds: [embed], components: [topRow, bottomRow] })) as NypsiMessage;
      }
    }

    await updateEmbed();
    
    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await edit({ embeds: [embed], components: [] }, msg);
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "buyOne") {
        if ((await getBalance(message.member)) < await getPriceForMarketTransaction(item.id, 1, "buy", message.member.id)) {
          await interaction.reply({
            embeds: [new ErrorEmbed("insufficient funds")],
            ephemeral: true,
          });
          await updateEmbed();
          return pageManager();
        }
        
        const price = await getPriceForMarketTransaction(item.id, 1, "buy", message.member.id);
        if (price == -1) {
          await interaction.reply({
            embeds: [new ErrorEmbed("not enough items")],
            ephemeral: true,
          });
          await updateEmbed();
          return pageManager();
        }

        await interaction.deferUpdate();

        return confirmTransaction("buy", item, 1, message.member.id, msg);
      } else if (res == "buyMulti") {
        
        const res = await quantitySelectionModal(item, "buy", interaction as ButtonInteraction);

        if (res) {

          const amount = res.fields.fields.get("amount").value;

          if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
            await res.reply({
              embeds: [new ErrorEmbed("invalid amount")],
              ephemeral: true,
            });
            await updateEmbed();
            return pageManager();
          }

          const formattedAmount = await formatBet(amount.toLowerCase(), message.member).catch(() => {});

          if (!formattedAmount) {
            await res.reply({
              embeds: [new ErrorEmbed("invalid amount")],
              ephemeral: true,
            });
            await updateEmbed();
            return pageManager();
          }
          
          const price = await getPriceForMarketTransaction(item.id, formattedAmount, "buy", message.member.id);
          if (price == -1) {
            await res.reply({
              embeds: [new ErrorEmbed("not enough items")],
              ephemeral: true,
            });
            await updateEmbed();
            return pageManager();
          }

          if ((await getBalance(message.member)) < await getPriceForMarketTransaction(item.id, formattedAmount, "buy", message.member.id)) {
            await interaction.reply({
              embeds: [new ErrorEmbed("insufficient funds")],
              ephemeral: true,
            });
            await updateEmbed();
            return pageManager();
          }

          await res.deferUpdate();

          return confirmTransaction("buy", item, formattedAmount, message.member.id, msg);
          
        }

        await updateEmbed();
        return pageManager();
      } else if (res == "sellOne") {
        const inventory = await getInventory(message.member)
        
        if (
          !inventory.find((i) => i.item == item.id) ||
          inventory.find((i) => i.item == item.id).amount < 1
        ) {
          await interaction.reply({
            embeds: [new ErrorEmbed(`you do not have this many ${item.plural ? item.plural : item.name}`)],
            ephemeral: true,
          });
          await updateEmbed();
          return pageManager();
        }
        
        const price = await getPriceForMarketTransaction(item.id, 1, "sell", message.member.id);
        if (price == -1) {
          await interaction.reply({
            embeds: [new ErrorEmbed("not enough items")],
            ephemeral: true,
          });
          await updateEmbed();
          return pageManager();
        }

        await interaction.deferUpdate();

        return confirmTransaction("sell", item, 1, message.member.id, msg);
      } else if (res == "sellMulti") {
        const res = await quantitySelectionModal(item, "sell", interaction as ButtonInteraction);

        
        if (res) {
          const amount = res.fields.fields.get("amount").value;

          if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
            await res.reply({
              embeds: [new ErrorEmbed("invalid amount")],
              ephemeral: true,
            });
            await updateEmbed();
            return pageManager();
          }

          const formattedAmount = await formatBet(amount.toLowerCase(), message.member).catch(() => {});

          if (!formattedAmount) {
            await res.reply({
              embeds: [new ErrorEmbed("invalid amount")],
              ephemeral: true,
            });
            await updateEmbed();
            return pageManager();
          }
          
          const price = await getPriceForMarketTransaction(item.id, formattedAmount, "sell", message.member.id);
          if (price == -1) {
            await res.reply({
              embeds: [new ErrorEmbed("not enough items")],
              ephemeral: true,
            });
            await updateEmbed();
            return pageManager();
          }
        
          const inventory = await getInventory(message.member)
        
          if (
            !inventory.find((i) => i.item == item.id) ||
            inventory.find((i) => i.item == item.id).amount < 1
          ) {
            await interaction.editReply({
              embeds: [new ErrorEmbed(`you do not have this many ${item.plural ? item.plural : item.name}`)],
              options: { ephemeral: true },
            });
            await updateEmbed();
            return pageManager();
          }

          await res.deferUpdate();

          return confirmTransaction("sell", item, formattedAmount, message.member.id, msg);
        }


        await updateEmbed();
        return pageManager();
      } else if (res == "refresh") {
        await interaction.deferUpdate();
        await updateEmbed();
        return pageManager();
      } 
    };

    return pageManager();
  }

  
  async function confirmTransaction(type: OrderType, item: Item, amount: number, userId: string, msg?: NypsiMessage) {
    const embed = new CustomEmbed(message.member).setHeader(
      `${item.name} market confirmation`,
      getEmojiImage(item.emoji),
    );

    const fromCommand = !(msg);

    const price = await getPriceForMarketTransaction(item.id, amount, type, userId);

    embed.setDescription(`are you sure you want to ${type} ${amount} ${amount == 1 || !item.plural ? item.name : item.plural} for $${price.toLocaleString()}?`);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirm").setLabel("confirm").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cancel").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

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
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await edit({ embeds: [embed], components: [] }, msg);
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "confirm") {

        const res = type == "buy" ? (await marketBuy(item, amount, price, message.member)): (await marketSell(item, amount, price, message.member));
        
        if (!res) {
          if (fromCommand) {
            await interaction.deferUpdate();
            return await msg.edit({ embeds: [new ErrorEmbed("unknown error occurred")], components: [] });
          }

          await interaction.reply({
            embeds: [new ErrorEmbed("unknown error occurred")],
            options: { ephemeral: true },
          });

          return itemView(item, msg);
        }

        if (res && res !== "success") {
          if (fromCommand) {
            await interaction.deferUpdate();
            return await edit({ embeds: [new ErrorEmbed(res.toString())], components: [] }, msg);
          }
          await interaction.reply({
            embeds: [new ErrorEmbed(res.toString())],
            ephemeral: true,
          });
          return itemView(item, msg);
        }
        
        if (fromCommand) {
          embed.setDescription(`✅ ${type == "buy" ? "bought" : "sold"} ${amount} ${item.emoji} ${amount == 1 || !item.plural ? item.name : item.plural} for $${price.toLocaleString()}`);
          await interaction.deferUpdate();
          return await msg.edit({ embeds: [embed], components: [] });
        }

        await interaction.reply({
          embeds: [new CustomEmbed(message.member, `✅ ${type == "buy" ? "bought" : "sold"} ${amount} ${item.emoji} ${amount == 1 || !item.plural ? item.name : item.plural} for $${price.toLocaleString()}`)],
          ephemeral: true,
        });
        return itemView(item, msg);
      } else if (res == "cancel") {
        if (fromCommand) await edit({ embeds: [embed], components: [] }, msg);
        await interaction.reply({
          embeds: [new CustomEmbed(message.member, "✅ cancelled")],
          ephemeral: true,
        });
        if (fromCommand) return;
        return itemView(item, msg);
      }
    };

    return pageManager();

  }
  

  async function quantitySelectionModal(item: Item, type: string, interaction: ButtonInteraction) {
    const id = `market-quantity-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder().setCustomId(id).setTitle("select quantity");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`how many ${item.plural ? item.plural : item.name} would you like to ${type}?`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10),
      ),
    );

    await interaction.showModal(modal);

    const filter = (i: ModalSubmitInteraction) =>
      i.user.id == interaction.user.id && i.customId === id;

    return await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});
  }
}

cmd.setRun(run);

module.exports = cmd;
