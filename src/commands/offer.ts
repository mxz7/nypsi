import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { getInventory, selectItem } from "../utils/functions/economy/inventory";
import { getRawLevel } from "../utils/functions/economy/levelling";
import {
  createOffer,
  deleteOffer,
  getBlockedList,
  getOwnedOffers,
  getTargetedOffers,
  setBlockedList,
} from "../utils/functions/economy/offers";
import { formatNumber, getItems, isEcoBanned } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { getPreferences } from "../utils/functions/users/notifications";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");

const cmd = new Command("offer", "create and manage offers", "money").setAliases([
  "offers",
  "onlyfans",
  "of",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((manage) => manage.setName("manage").setDescription("manage your current offers"))
  .addSubcommand((block) =>
    block
      .setName("block")
      .setDescription("manage your blocked users/items")
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("item or user to block/unblock")
          .setAutocomplete(true)
          .setRequired(true),
      ),
  )
  .addSubcommand((create) =>
    create
      .setName("create")
      .setDescription("create an offer")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("user you want to offer something to")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("item-global")
          .setDescription("item you want to buy")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option.setName("amount").setDescription("amount you want to buy").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("money").setDescription("how much $ you want to offer").setRequired(true),
      ),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 7);

  if (message.author.createdTimestamp > dayjs().subtract(1, "day").unix() * 1000) {
    return send({
      embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
    });
  }

  if ((await getRawLevel(message.member)) < 3) {
    return send({
      embeds: [new ErrorEmbed("you must be at least level 3 before you can create an offer")],
    });
  }

  const items = getItems();

  const manageOffers = async (msg?: Message) => {
    const offers = await getOwnedOffers(message.author.id);

    const embed = new CustomEmbed(message.member).setHeader(
      "your offers",
      message.author.avatarURL(),
    );

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    let currentPage = 0;
    const maxPage = offers.length - 1;

    const displayOffer = async (page: number) => {
      embed.setFields(
        {
          name: "item",
          value: `**${offers[page].itemAmount}x** ${items[offers[page].itemId].emoji} ${
            items[offers[page].itemId].name
          }`,
          inline: true,
        },
        {
          name: "cost",
          value: `$**${offers[page].money.toLocaleString()}**`,
          inline: true,
        },
        {
          name: "target",
          value: `${(await getLastKnownUsername(offers[page].targetId).catch(() => null)) || "unknown user"} (${
            offers[page].targetId
          })`,
          inline: true,
        },
      );
      embed.setFooter({ text: `page ${page + 1}/${maxPage + 1}` });
    };

    const updateButtons = (page: number) => {
      if (offers.length > 0) {
        row.setComponents(
          new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger),
        );

        if (offers.length == 1) {
          row.components[0].setDisabled(true);
          row.components[1].setDisabled(true);
        } else {
          if (page === 0) {
            row.components[0].setDisabled(true);
          } else if (page === offers.length - 1) {
            row.components[1].setDisabled(true);
          }
        }
      }
    };

    if (offers.length == 0) {
      embed.setDescription("you don't have any active offers");
    } else if (offers.length > 1) {
      await displayOffer(0);
    } else {
      row.addComponents(
        new ButtonBuilder().setCustomId("del").setLabel("delete").setStyle(ButtonStyle.Danger),
      );
      await displayOffer(0);
    }

    updateButtons(0);

    const payload: BaseMessageOptions | InteractionReplyOptions = {
      embeds: [embed],
      components: [row],
    };

    if (row.components.length == 0) payload.components = [];

    if (msg) {
      msg = await msg.edit(payload as MessageEditOptions);
    } else {
      msg = await send(payload);
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
          await msg.edit({ embeds: [embed], components: [] });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (res == "⬅") {
        if (currentPage == 0) {
          return pageManager();
        }

        currentPage--;

        await displayOffer(currentPage);

        updateButtons(currentPage);

        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      } else if (res == "➡") {
        if (currentPage == maxPage) {
          return pageManager();
        }

        currentPage++;

        await displayOffer(currentPage);
        updateButtons(currentPage);

        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      } else if (res == "del") {
        const res = await deleteOffer(offers[currentPage], message.client as NypsiClient).catch(
          (e) => {
            logger.warn("failed to delete offer", e);
          },
        );

        if (res) {
          await interaction.followUp({
            embeds: [new CustomEmbed(message.member, "✅ your offer has been deleted")],
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            embeds: [new CustomEmbed(message.member, "failed to delete that offer")],
            ephemeral: true,
          });
        }

        return manageOffers(msg);
      }
    };

    return pageManager();
  };

  if (args.length != 0 && args[0].toLowerCase() === "create") args.shift();

  if (args.length == 0 || args[0].toLowerCase() == "manage") {
    return manageOffers();
  } else if (args[0].toLowerCase() == "block") {
    let current = await getBlockedList(message.author.id);
    const max = 100;

    const items = getItems();

    if (args.length == 1) {
      if (current.length == 0) {
        return send({
          embeds: [new CustomEmbed(message.member, "you are have no items or people blocked")],
        });
      }

      const pages = PageManager.createPages(
        current.map((i) => {
          if (items[i]) return `${items[i].emoji} ${items[i].name}`;
          if (message.guild.members.cache.has(i))
            return `\`${i}\` (${message.guild.members.cache.get(i).user.username})`;
          return `\`${i}\``;
        }),
      );

      const embed = new CustomEmbed(message.member)
        .setHeader("offer blocklist", message.author.avatarURL())
        .setDescription(pages.get(1).join("\n"));

      if (pages.size === 1) {
        return send({ embeds: [embed] });
      }

      const row = PageManager.defaultRow();

      const msg = await send({ embeds: [embed], components: [row] });

      const manager = new PageManager({
        embed,
        pages,
        row,
        userId: message.author.id,
        allowMessageDupe: true,
        message: msg,
      });

      return manager.listen();
    }

    const searchTag = args[1].toLowerCase();

    const selectedItem = selectItem(searchTag);
    const selectedMember = await getMember(message.guild, searchTag);

    if (!selectedItem && !selectedMember)
      return send({ embeds: [new ErrorEmbed("invalid member or item")] });

    let value = "";

    if (selectedItem) {
      value = selectedItem.id;
    } else {
      value = selectedMember.id;
    }

    let desc = "";

    if (current.includes(value)) {
      desc = `✅ removed \`${value}\``;

      current.splice(current.indexOf(value), 1);

      current = await setBlockedList(message.author.id, current);
    } else {
      if (current.length >= max) {
        return send({ embeds: [new ErrorEmbed("you have reached the limit of your blocklist")] });
      }

      desc = `✅ added \`${value}\``;

      current.push(value);
      current = await setBlockedList(message.author.id, current);
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      "offer blocklist",
      message.author.avatarURL(),
    );

    if (current.length > 0) {
      embed.addField(
        "blocklist:",
        current
          .map((i) => {
            if (items[i]) return `${items[i].emoji} ${items[i].name}`;
            if (message.guild.members.cache.has(i))
              return `\`${i}\` (${message.guild.members.cache.get(i).user.username})`;
            return `\`${i}\``;
          })
          .join("\n"),
      );
    }

    return send({ embeds: [embed] });
  } else {
    if (args.length < 3)
      return send({ embeds: [new ErrorEmbed("/offer create <target> <item> <amount> <money>")] });
    let max = 3;

    if (await isPremium(message.member)) {
      max *= await getTier(message.member);
    }

    const currentOffers = await getOwnedOffers(message.author.id);

    if (currentOffers.length + 1 > max)
      return send({
        embeds: [new ErrorEmbed(`you have reached the max amount of offers (${max})`)],
      });

    const target = await getMember(message.guild, args[0].toLowerCase());

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (target.user.id == message.author.id) {
      return send({ embeds: [new ErrorEmbed("lol xd cant offer yourself something")] });
    }

    if (await isEcoBanned(target.user.id))
      return send({ embeds: [new ErrorEmbed("theyre banned lol xd be mean to them for me ty")] });

    if ((await getPreferences(target)).offers <= (await getTargetedOffers(target.user.id)).length) {
      if ((await getPreferences(target)).offers === 0)
        return send({
          embeds: [new ErrorEmbed(`**${target.user.username}** has disabled offers`)],
        });
      return send({
        embeds: [
          new ErrorEmbed(
            `**${target.user.username}** has already received their max amount of offers (${
              (await getPreferences(target)).offers
            })`,
          ),
        ],
      });
    }

    const selected = selectItem(args[1].toLowerCase());

    if (!selected) return send({ embeds: [new ErrorEmbed("invalid item")] });

    if (selected.account_locked)
      return send({ embeds: [new ErrorEmbed("this item cant be traded")] });

    const blocked = await getBlockedList(target.user.id);

    if (blocked.includes(selected.id))
      return send({
        embeds: [
          new ErrorEmbed(
            `**${target.user.username}** has blocked offers for ${selected.emoji} ${selected.name}`,
          ),
        ],
      });

    if (blocked.includes(message.author.id))
      return send({
        embeds: [new ErrorEmbed(`**${target.user.username}** has blocked offers from you`)],
      });

    let amount = parseInt(args[2]);

    if (args.length === 3) amount = 1;

    if (!amount || isNaN(amount) || amount < 1)
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    const inventory = await getInventory(target);

    if (
      !inventory.find((i) => i.item === selected.id) ||
      inventory.find((i) => i.item === selected.id).amount < amount
    )
      return send({
        embeds: [
          new ErrorEmbed(
            `**${target.user.username}** doesnt have ${amount}x ${selected.emoji} ${selected.name}`,
          ),
        ],
      });

    const money = formatNumber(args.length === 3 ? args[2] : args[3]);

    if (!money || money < 1 || isNaN(money))
      return send({ embeds: [new ErrorEmbed("invalid amount")] });

    if (target.user.createdTimestamp > dayjs().subtract(1, "day").unix() * 1000) {
      return send({
        embeds: [new ErrorEmbed(`${target.user.toString()} cannot use offers yet`)],
      });
    }

    if ((await getRawLevel(target)) < 3) {
      return send({
        embeds: [new ErrorEmbed(`${target.user.toString()} cannot use offers yet`)],
      });
    }

    const balance = await getBalance(message.member);

    if (balance < money) return send({ embeds: [new ErrorEmbed("you cant afford this")] });
    await updateBalance(message.member, balance - money);
    const res = await createOffer(target.user, selected.id, amount, money, message.member);

    if (!res) {
      await updateBalance(message.member, balance);
      return send({ embeds: [new ErrorEmbed("failed to create offer")] });
    } else {
      return send({
        embeds: [
          new CustomEmbed(message.member, `✅ offer has been sent to **${target.user.username}**`),
        ],
      });
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
