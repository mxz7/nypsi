import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  APIMessageComponentEmoji,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
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
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Item } from "../types/Economy";
import Constants from "../utils/Constants";
import { addBalance, getBalance, removeBalance } from "../utils/functions/economy/balance";
import {
  addInventoryItem,
  getInventory,
  selectItem,
  setInventoryItem,
} from "../utils/functions/economy/inventory";
import {
  bumpTradeRequest,
  createTradeRequest,
  deleteTradeRequest,
  getTradeRequestByMessage,
  getTradeRequests,
} from "../utils/functions/economy/trade_requests";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { createUser, formatBet, getItems, userExists } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("trade", "create and manage your trades", "money").setAliases(["trades"]);

cmd.slashEnabled = false;

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

  await addCooldown(cmd.name, message.member, 5);

  if (message.author.createdTimestamp > dayjs().subtract(1, "day").valueOf()) {
    return send({
      embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
    });
  }

  if ((await getRawLevel(message.member)) < 1) {
    return send({
      embeds: [new ErrorEmbed("you must be level 1 before you create a trade request")],
    });
  }

  const items = getItems();

  let inventory = await getInventory(message.member);
  let balance = await getBalance(message.member);

  const createTradeRequestProcess = async (msg: NypsiMessage) => {
    const embed = new CustomEmbed(message.member).setHeader(
      "create a trade request",
      message.author.avatarURL(),
    );

    const offeredItems: { item: Item; amount: number }[] = [];
    let offeredMoney = 0;

    const requestedItems: { item: Item; amount: number }[] = [];

    const updateRequestEmbed = async (showButtons: boolean) => {
      embed.setFields(
        {
          name: "requesting",
          value: `${requestedItems.length > 0 ? requestedItems.map((item) => `**${item.amount.toLocaleString()}x** ${item.item.emoji} ${item.item.name}`).join("\n") : "none"}`,
          inline: false,
        },
        {
          name: "offering",
          value: `${offeredMoney > 0 ? `$${offeredMoney.toLocaleString()}` : ""}${offeredItems.length > 0 ? `\n${offeredItems.map((item) => `**${item.amount.toLocaleString()}x** ${item.item.emoji} ${item.item.name}`).join("\n")}` : offeredMoney > 0 ? "" : "\nnone"}`,
          inline: false,
        },
      );

      const topRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("addRequestedItem")
          .setLabel("request item")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(requestedItems.length >= 3),
        new ButtonBuilder()
          .setCustomId("addOfferedItem")
          .setLabel("offer item")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(offeredItems.length >= 3),
        new ButtonBuilder()
          .setCustomId("addOfferedMoney")
          .setLabel("offer money")
          .setStyle(ButtonStyle.Secondary),
      );

      const middleRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("deleteRequestedItem")
          .setLabel("delete item request")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(requestedItems.length == 0),
        new ButtonBuilder()
          .setCustomId("deleteOfferedItem")
          .setLabel("delete item offer")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(offeredItems.length == 0),
        new ButtonBuilder()
          .setCustomId("deleteOfferedMoney")
          .setLabel("delete money offer")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(offeredMoney == 0),
      );

      const bottomRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("create")
          .setLabel("create")
          .setStyle(ButtonStyle.Success)
          .setDisabled(requestedItems.length == 0 || offeredItems.length == 0),
      );

      await edit(
        { embeds: [embed], components: showButtons ? [topRow, middleRow, bottomRow] : [] },
        msg,
      );
    };

    await updateRequestEmbed(true);

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, componentType: ComponentType.Button, time: 60000 })
        .then(async (collected) => {
          if (!collected.customId.startsWith("add"))
            await collected.deferUpdate().catch(() => {
              fail = true;
              return pageManager();
            });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await updateRequestEmbed(false);
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "addRequestedItem") {
        const res = await addRequestedItem(interaction).catch(() => {});

        if (res) {
          await res.deferReply({ ephemeral: true });

          const item = res.fields.fields.get("item").value;
          const amount = res.fields.fields.get("amount").value;

          const selected = selectItem(item);

          if (!selected) {
            await res.editReply({
              embeds: [new ErrorEmbed("couldnt find that item")],
              options: { ephemeral: true },
            });
          } else if (selected.account_locked) {
            await res.editReply({
              embeds: [new ErrorEmbed("this item cannot be traded")],
              options: { ephemeral: true },
            });
          } else if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
            await res.editReply({
              embeds: [new ErrorEmbed("invalid amount")],
              options: { ephemeral: true },
            });
          } else {
            const index = requestedItems.findIndex((entry) => entry.item === selected);

            if (index !== -1) {
              requestedItems[index] = { item: selected, amount: parseInt(amount) };
            } else {
              requestedItems.push({ item: selected, amount: parseInt(amount) });
            }

            await res.deleteReply();
          }
        }

        await updateRequestEmbed(true);
        return pageManager();
      }

      if (res == "addOfferedItem") {
        const res = await addOfferedItem(interaction).catch(() => {});

        if (res) {
          await res.deferReply({ ephemeral: true });

          const item = res.fields.fields.get("item").value;
          let amount = res.fields.fields.get("amount").value;

          if (amount.toLowerCase() === "all") {
            amount = inventory.find((i) => i.item == selected.id).amount.toString();
          }

          const selected = selectItem(item);

          if (!selected) {
            await res.editReply({
              embeds: [new ErrorEmbed("couldnt find that item")],
              options: { ephemeral: true },
            });
          } else if (selected.account_locked) {
            await res.editReply({
              embeds: [new ErrorEmbed("this item cannot be traded")],
              options: { ephemeral: true },
            });
          } else if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
            await res.editReply({
              embeds: [new ErrorEmbed("invalid amount")],
              options: { ephemeral: true },
            });
          } else if (
            !inventory.find((i) => i.item == selected.id) ||
            inventory.find((i) => i.item == selected.id).amount < parseInt(amount)
          ) {
            await res.editReply({
              embeds: [new ErrorEmbed(`you do not have enough ${selected.plural}`)],
              options: { ephemeral: true },
            });
          } else {
            const index = offeredItems.findIndex((entry) => entry.item === selected);

            if (index !== -1) {
              offeredItems[index] = { item: selected, amount: parseInt(amount) };
            } else {
              offeredItems.push({ item: selected, amount: parseInt(amount) });
            }

            await res.deleteReply();
          }
        }

        await updateRequestEmbed(true);
        return pageManager();
      }

      if (res == "addOfferedMoney") {
        const res = await addOfferedMoney(interaction).catch(() => {});

        if (res) {
          await res.deferReply({ ephemeral: true });

          let amount = res.fields.fields.get("amount").value;

          if (amount.toLowerCase() === "all") {
            amount = balance.toString();
          } else if (!parseInt(amount) || isNaN(parseInt(amount)) || parseInt(amount) < 1) {
            await res.editReply({
              embeds: [new ErrorEmbed("invalid amount")],
              options: { ephemeral: true },
            });
          } else if (parseInt(amount) > balance) {
            await res.editReply({
              embeds: [new ErrorEmbed("you do not have enough money")],
              options: { ephemeral: true },
            });
          } else {
            const cost = await formatBet(amount.toLowerCase(), message.member).catch(() => {});

            if (!cost)
              await res.editReply({
                embeds: [new ErrorEmbed("invalid amount")],
                options: { ephemeral: true },
              });
            else offeredMoney = cost;

            await res.deleteReply();
          }
        }

        await updateRequestEmbed(true);
        return pageManager();
      }

      if (res == "deleteRequestedItem") {
        if (requestedItems.length == 1) {
          requestedItems.pop();
        } else {
          const item = await deleteItem(msg, requestedItems);
          if (item) {
            const index = offeredItems.findIndex((entry) => entry.item.id === item);
            requestedItems.splice(index, 1);
          }
        }

        await updateRequestEmbed(true);
        return pageManager();
      }

      if (res == "deleteOfferedItem") {
        if (offeredItems.length == 1) {
          offeredItems.pop();
        } else {
          const item = await deleteItem(msg, offeredItems);
          if (item) {
            const index = offeredItems.findIndex((entry) => entry.item.id === item);
            offeredItems.splice(index, 1);
          }
        }

        await updateRequestEmbed(true);
        return pageManager();
      }

      if (res == "deleteOfferedMoney") {
        offeredMoney = 0;

        await updateRequestEmbed(true);
        return pageManager();
      }

      if (res == "create") {
        inventory = await getInventory(message.member);
        balance = await getBalance(message.member);

        if (offeredMoney > balance) {
          return interaction.followUp({
            embeds: [new CustomEmbed(message.member, "sneaky bitch")],
            ephemeral: true,
          });
        }

        for (const item of offeredItems) {
          if (
            !inventory.find((i) => i.item == item.item.id) ||
            inventory.find((i) => i.item == item.item.id).amount < item.amount
          ) {
            return interaction.followUp({
              embeds: [new CustomEmbed(message.member, "sneaky bitch")],
              ephemeral: true,
            });
          }
        }

        const tradeRequests = await getTradeRequests(message.member);

        let max = 3;

        if (await isPremium(message.member)) {
          max += await getTier(message.member);
        }

        if (tradeRequests.length >= max)
          return interaction.followUp({
            embeds: [new CustomEmbed(message.member, "sneaky bitch")],
            ephemeral: true,
          });

        for (const item of offeredItems) {
          await setInventoryItem(
            message.member,
            item.item.id,
            inventory.find((i) => i.item == item.item.id).amount - item.amount,
          );
        }

        if (offeredMoney > 0) await removeBalance(message.member, offeredMoney);

        const url = await createTradeRequest(
          message.member,
          requestedItems,
          offeredItems,
          offeredMoney,
        ).catch((err) => console.log(err));

        if (url) {
          embed.setDescription(`[your trade request has been created](${url})`);
          embed.setFields();
        } else {
          embed.setDescription("there was an error while creating your trade request");
        }

        return await edit({ embeds: [embed], components: [] }, msg);
      }
    };

    return pageManager();
  };

  async function addRequestedItem(interaction: ButtonInteraction) {
    const id = `request-item-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder().setCustomId(id).setTitle("request item");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("item")
          .setLabel("what item do you want to request?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(25),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("how many do you want to request?")
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

  async function addOfferedItem(interaction: ButtonInteraction) {
    const id = `offer-item-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder().setCustomId(id).setTitle("offer item");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("item")
          .setLabel("what item do you want to offer?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(25),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("how many do you want to offer?")
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

  async function addOfferedMoney(interaction: ButtonInteraction) {
    const id = `offer-money-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder().setCustomId(id).setTitle("offer money");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("how much money do you want to offer?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(15),
      ),
    );

    await interaction.showModal(modal);

    const filter = (i: ModalSubmitInteraction) =>
      i.user.id == interaction.user.id && i.customId === id;

    return await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});
  }

  const deleteItem = async (msg: NypsiMessage, items: { item: Item; amount: number }[]) => {
    const embed = new CustomEmbed(message.member).setHeader(
      "create a trade request",
      message.author.avatarURL(),
    );

    embed.setDescription("which item would you like to delete?");

    const options: StringSelectMenuOptionBuilder[] = [];

    for (const item of items) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setValue(item.item.id)
          .setEmoji(item.item.emoji as APIMessageComponentEmoji)
          .setLabel(item.item.name),
      );
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("item")
        .setPlaceholder("item you want to delete")
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

  const manageTradeRequests = async (msg?: NypsiMessage) => {
    const tradeRequests = await getTradeRequests(message.member);

    const embed = new CustomEmbed(message.member).setHeader(
      "your trade requests",
      message.author.avatarURL(),
    );

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    let currentPage = 0;
    const maxPage = tradeRequests.length - 1;

    const displayTradeRequests = (page: number) => {
      embed.setFields(
        {
          name: "requesting",
          value: `${tradeRequests[page].requestedItems.length > 0 ? tradeRequests[page].requestedItems.map((item) => `**${parseInt(item.split(":")[1]).toLocaleString()}x** ${items[item.split(":")[0]].emoji} [${items[item.split(":")[0]].name}](https://nypsi.xyz/item/${item.split(":")[0]})`).join("\n") : "none"}`,
          inline: true,
        },
        {
          name: "offering",
          value: `${tradeRequests[page].offeredMoney > 0 ? `$${tradeRequests[page].offeredMoney.toLocaleString()}` : ""}\n${tradeRequests[page].offeredItems.map((item) => `**${parseInt(item.split(":")[1]).toLocaleString()}x** ${items[item.split(":")[0]].emoji} [${items[item.split(":")[0]].name}](https://nypsi.xyz/item/${item.split(":")[0]})`).join("\n")}`,
          inline: true,
        },
        {
          name: "created",
          value: `<t:${Math.floor(tradeRequests[page].createdAt.getTime() / 1000)}:R>`,
          inline: true,
        },
      );
      embed.setFooter({ text: `page ${page + 1}/${maxPage + 1}` });
    };

    const updateButtons = async (page: number) => {
      if (tradeRequests.length > 0) {
        row.setComponents(
          new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger),
        );

        if (tradeRequests.length == 1) {
          row.components[0].setDisabled(true);
          row.components[1].setDisabled(true);
        } else {
          if (page === 0) {
            row.components[0].setDisabled(true);
          } else if (page === tradeRequests.length - 1) {
            row.components[1].setDisabled(true);
          }
        }

        if (
          dayjs(tradeRequests[page].createdAt).isAfter(
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

      let max = 3;

      if (await isPremium(message.member)) {
        max += await getTier(message.member);
      }

      if (tradeRequests.length < max) {
        row.addComponents(
          new ButtonBuilder()
            .setLabel("create trade request")
            .setCustomId("y")
            .setStyle(ButtonStyle.Success),
        );
      }
    };

    if (tradeRequests.length == 0) {
      embed.setDescription("you don't currently have any trade requests");
    } else if (tradeRequests.length > 1) {
      displayTradeRequests(0);
    } else {
      row.addComponents(
        new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger),
      );
      displayTradeRequests(0);
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
        return createTradeRequestProcess(msg);
      } else if (res == "⬅") {
        if (currentPage == 0) {
          return pageManager();
        }

        currentPage--;

        displayTradeRequests(currentPage);

        await updateButtons(currentPage);

        await edit({ embeds: [embed], components: [row] }, msg);
        return pageManager();
      } else if (res == "➡") {
        if (currentPage == maxPage) {
          return pageManager();
        }

        currentPage++;

        displayTradeRequests(currentPage);
        await updateButtons(currentPage);

        await edit({ embeds: [embed], components: [row] }, msg);
        return pageManager();
      } else if (res == "del") {
        const res = await deleteTradeRequest(
          tradeRequests[currentPage].id,
          message.client as NypsiClient,
        ).catch(() => {});

        if (res) {
          for (const item of tradeRequests[currentPage].offeredItems) {
            const itemId = item.split(":")[0];
            const amount = parseInt(item.split(":")[1]);

            await addInventoryItem(tradeRequests[currentPage].ownerId, itemId, amount);
          }

          if (tradeRequests[currentPage].offeredMoney > 0) {
            await addBalance(
              tradeRequests[currentPage].ownerId,
              Number(tradeRequests[currentPage].offeredMoney),
            );
          }

          await interaction.followUp({
            embeds: [new CustomEmbed(message.member, "✅ your trade request has been deleted")],
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            embeds: [new CustomEmbed(message.member, "failed to delete that trade request")],
            ephemeral: true,
          });
        }

        return manageTradeRequests(msg);
      } else if (res === "bump") {
        const bumpRes = await bumpTradeRequest(
          tradeRequests[currentPage].id,
          message.client as NypsiClient,
        );

        if (!bumpRes) {
          await interaction.followUp({
            embeds: [new ErrorEmbed("this trade request has already been bumped recently")],
            ephemeral: true,
          });
          displayTradeRequests(currentPage);
          await updateButtons(currentPage);
          await msg.edit({ embeds: [embed], components: [row] });
          return pageManager();
        } else {
          await interaction.followUp({
            embeds: [
              new CustomEmbed(message.member, `[your trade request has been bumped](${bumpRes})`),
            ],
            ephemeral: true,
          });
          displayTradeRequests(currentPage);
          await updateButtons(currentPage);
          await msg.edit({ embeds: [embed], components: [row] });
          return pageManager();
        }
      }
    };

    return pageManager();
  };

  if (args.length > 0 && args[0].toLowerCase() == "del") {
    if (message.guild.id != Constants.NYPSI_SERVER_ID) return;

    const roles = message.member.roles.cache;

    let allow = false;
    for (const roleId of Constants.AUCTION_MANAGEMENT_ROLE_IDS) {
      if (roles.has(roleId)) allow = true;
    }

    if (!allow) return;

    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed("use the message id dumbass")] });
    }

    const tradeRequest = await getTradeRequestByMessage(args[1]);

    if (!tradeRequest)
      return message.channel.send({ embeds: [new ErrorEmbed("invalid trade request bro")] });

    logger.info(
      `admin: ${message.author.id} (${message.author.username}) deleted trade request`,
      tradeRequest,
    );

    if (tradeRequest.completed) {
      await prisma.tradeRequest.delete({
        where: {
          messageId: tradeRequest.messageId,
        },
      });
    } else {
      await deleteTradeRequest(tradeRequest.id, message.client as NypsiClient);

      if (!(await userExists(tradeRequest.ownerId))) return;

      for (const item of tradeRequest.offeredItems) {
        const itemId = item.split(":")[0];
        const amount = parseInt(item.split(":")[1]);

        await addInventoryItem(tradeRequest.ownerId, itemId, amount);
      }

      if (tradeRequest.offeredMoney > 0) {
        await addBalance(tradeRequest.ownerId, Number(tradeRequest.offeredMoney));
      }

      if ((await getDmSettings(tradeRequest.ownerId)).market) {
        const embed = new CustomEmbed().setColor(Constants.EMBED_FAIL_COLOR);

        embed.setDescription(
          `your trade request has been removed by a staff. your items have been returned.`,
        );

        if (args.length > 2) {
          args.splice(0, 2);
          embed.addField("reason", args.join(" "));
        }

        addNotificationToQueue({
          memberId: tradeRequest.ownerId,
          payload: {
            embed: embed,
            content: "your trade request has been removed by a staff member",
          },
        });
      }
    }

    await (message as Message).react("✅");

    return;
  } else return manageTradeRequests();
}

cmd.setRun(run);

module.exports = cmd;
