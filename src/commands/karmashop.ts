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
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { addProgress } from "../utils/functions/economy/achievements";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { getPrestige } from "../utils/functions/economy/prestige";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getXp, updateXp } from "../utils/functions/economy/xp";
import { getKarma, removeKarma } from "../utils/functions/karma/karma";
import { closeKarmaShop, getKarmaShopItems, isKarmaShopOpen, openKarmaShop } from "../utils/functions/karma/karmashop";
import { arrayToPage } from "../utils/functions/page";
import { getTier, isPremium, setExpireDate } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import dayjs = require("dayjs");

const cmd = new Command("karmashop", "buy stuff with your karma", Categories.INFO).setAliases(["ks"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view the karma shop"))
  .addSubcommand((buy) =>
    buy
      .setName("buy")
      .setDescription("buy something from the karma shop")
      .addStringOption((option) =>
        option
          .setName("item-karmashop")
          .setDescription("item you want to buy from the karma shop")
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

const amount = new Map<string, number>();

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) await createUser(message.member);
  if (message.author.id == Constants.TEKOH_ID) {
    if (args[0] && args[0].toLowerCase() == "open") {
      return openKarmaShop();
    } else if (args[0] && args[0].toLowerCase() == "close") {
      return closeKarmaShop();
    }
  }

  const items = getKarmaShopItems();

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
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

  if (!isKarmaShopOpen() && message.guild.id == "747056029795221513") {
    const embed = new CustomEmbed(message.member);

    embed.setDescription(
      "the karma shop is currently **closed**\nkeep server notifications enabled to see when the karma shop is opened!"
    );

    return send({ embeds: [embed] });
  }

  if (message.guild.id != "747056029795221513") {
    return send({
      content: "discord.gg/hJTDNST",
      embeds: [new CustomEmbed(message.member, "the karma shop can **only be** accessed in the official nypsi server")],
    });
  }

  let limit = 7;

  if (await isPremium(message.author.id)) {
    limit = 15;
    if ((await getTier(message.author.id)) == 4) {
      limit = 25;
    }
  }

  const itemIDs = Array.from(Object.keys(items));

  if (args.length == 0 || args.length == 1) {
    inPlaceSort(itemIDs).desc((i) => items[i].items_left);

    const pages = arrayToPage(
      itemIDs.map((i) => items[i]),
      6
    );

    const embed = new CustomEmbed(message.member);

    const displayItemsLeft = () => {
      let text;
      if (amount.has(message.author.id)) {
        text = `| ${amount.get(message.author.id)}/${limit}`;
      } else {
        text = `| 0/${limit}`;
      }

      return text;
    };

    embed.setHeader("karma shop", message.author.avatarURL());
    embed.setFooter({
      text: `page 1/${pages.size} | you have ${(
        await getKarma(message.member)
      ).toLocaleString()} karma ${displayItemsLeft()}`,
    });

    for (const item of pages.get(1)) {
      embed.addField(
        item.id,
        `${item.emoji} **${item.name}**\n**cost** ${item.cost.toLocaleString()} karma\n*${item.items_left}* available`,
        true
      );
    }

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    let msg: Message;

    if (pages.size == 1) {
      return await send({ embeds: [embed] });
    } else {
      msg = await send({ embeds: [embed], components: [row] });
    }

    if (pages.size > 1) {
      let currentPage = 1;

      const lastPage = pages.size;

      const filter = (i: Interaction) => i.user.id == message.author.id;

      const pageManager = async (): Promise<void> => {
        const reaction = await msg
          .awaitMessageComponent({ filter, time: 30000 })
          .then(async (collected) => {
            await collected.deferUpdate();
            return collected.customId;
          })
          .catch(async () => {
            await msg.edit({ components: [] });
          });

        const newEmbed = new CustomEmbed(message.member).setHeader("karma shop", message.author.avatarURL());

        if (!reaction) return;

        if (reaction == "⬅") {
          if (currentPage <= 1) {
            return pageManager();
          } else {
            currentPage--;
            for (const item of pages.get(currentPage)) {
              newEmbed.addField(
                item.id,
                `${item.emoji} **${item.name}**\n**cost** ${item.cost.toLocaleString()} karma\n*${
                  item.items_left
                }* available`,
                true
              );
            }
            newEmbed.setFooter({
              text: `page ${currentPage}/${pages.size} | you have ${(
                await getKarma(message.member)
              ).toLocaleString()} karma ${displayItemsLeft()}`,
            });
            if (currentPage == 1) {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
              );
            } else {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
                new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
              );
            }
            await msg.edit({ embeds: [newEmbed], components: [row] });
            return pageManager();
          }
        } else if (reaction == "➡") {
          if (currentPage + 1 > lastPage) {
            return pageManager();
          } else {
            currentPage++;
            for (const item of pages.get(currentPage)) {
              newEmbed.addField(
                item.id,
                `${item.emoji} **${item.name}**\n**cost** ${item.cost.toLocaleString()} karma\n*${
                  item.items_left
                }* available`,
                true
              );
            }
            newEmbed.setFooter({
              text: `page ${currentPage}/${pages.size} | you have ${(
                await getKarma(message.member)
              ).toLocaleString()} karma ${displayItemsLeft()}`,
            });
            if (currentPage == lastPage) {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
                new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
              );
            } else {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
                new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
              );
            }
            await msg.edit({ embeds: [newEmbed], components: [row] });
            return pageManager();
          }
        }
      };
      return pageManager();
    }
  } else if (args[0].toLowerCase() == "buy") {
    if (message.author.createdTimestamp > dayjs().subtract(14, "day").unix() * 1000) {
      return send({
        embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
      });
    }

    if ((await getPrestige(message.member)) < 1) {
      if ((await getXp(message.member)) < 100) {
        return send({
          embeds: [new ErrorEmbed("you cannot use this command yet. u might be an alt. or a bot 😳")],
        });
      }
    }

    const amountBought = amount.get(message.author.id);

    if (amountBought >= limit) {
      return send({
        embeds: [
          new CustomEmbed(message.member, `you have reached your limit for buying from the karma shop (${limit} items)`),
        ],
      });
    }

    const searchTag = args[1].toLowerCase();

    let selected;

    for (const itemName of Array.from(Object.keys(items))) {
      if (searchTag == itemName) {
        selected = itemName;
        break;
      } else if (searchTag == itemName.split("_").join("")) {
        selected = itemName;
        break;
      }
    }

    selected = items[selected];

    if (!selected) {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
    }

    if (selected.items_left <= 0) {
      return send({ embeds: [new ErrorEmbed("there is none of this item left in the shop")] });
    }

    if ((await getKarma(message.member)) < selected.cost) {
      return send({ embeds: [new ErrorEmbed("you cannot afford this")] });
    }

    await addCooldown(cmd.name, message.member, 10);

    switch (selected.id) {
      case "bronze":
        if ((await isPremium(message.member)) && (await getTier(message.member)) >= 1) {
          return send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
        } else {
          if (message.guild.id != "747056029795221513") {
            return send({
              embeds: [new ErrorEmbed("you must be in the offical nypsi server to buy premium (discord.gg/hJTDNST)")],
            });
          } else {
            await message.member.roles.add("819870590718181391");
          }
        }
        break;
      case "silver":
        if ((await isPremium(message.member)) && (await getTier(message.member)) >= 2) {
          return send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
        } else {
          if (message.guild.id != "747056029795221513") {
            return send({
              embeds: [new ErrorEmbed("you must be in the offical nypsi server to buy premium (discord.gg/hJTDNST)")],
            });
          } else {
            await message.member.roles.add("819870727834566696");
          }
        }
        break;
      case "gold":
        if ((await isPremium(message.member)) && (await getTier(message.member)) >= 3) {
          return send({ embeds: [new ErrorEmbed("you already have this membership or better")] });
        } else {
          if (message.guild.id != "747056029795221513") {
            return send({
              embeds: [new ErrorEmbed("you must be in the offical nypsi server to buy premium (discord.gg/hJTDNST)")],
            });
          } else {
            await message.member.roles.add("819870846536646666");
          }
        }
        break;
      case "100xp":
        await updateXp(message.member, (await getXp(message.member)) + 100);
        break;
      case "1000xp":
        await updateXp(message.member, (await getXp(message.member)) + 1000);
        break;
      case "basic_crate":
        await addInventoryItem(message.member, "basic_crate", 1);
        break;
      case "nypsi_crate":
        await addInventoryItem(message.member, "nypsi_crate", 1);
        break;
    }

    if (selected.id == "bronze" || selected.id == "silver" || selected.id == "gold") {
      setTimeout(async () => {
        await setExpireDate(message.member, dayjs().add(7, "days").toDate(), message.client as NypsiClient);
      }, 1000);
    }

    if (amount.has(message.author.id)) {
      amount.set(message.author.id, amount.get(message.author.id) + 1);
    } else {
      amount.set(message.author.id, 1);
    }

    await removeKarma(message.member, selected.cost);

    if (!selected.unlimited) {
      items[selected.id].items_left -= 1;
    }

    await addProgress(message.author.id, "wizard", 1);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have bought ${selected.emoji} ${selected.name} for ${selected.cost.toLocaleString()} karma`
        ),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
