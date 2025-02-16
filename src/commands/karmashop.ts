import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { KarmaShopItem } from "../types/Karmashop";
import Constants from "../utils/Constants";
import { addProgress } from "../utils/functions/economy/achievements";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addXp } from "../utils/functions/economy/xp";
import { getKarma, removeKarma } from "../utils/functions/karma/karma";
import {
  closeKarmaShop,
  getKarmaShopItems,
  getLastKarmaShopOpen,
  getNextKarmaShopOpen,
  isKarmaShopOpen,
  openKarmaShop,
  setKarmaShopItems,
} from "../utils/functions/karma/karmashop";
import PageManager from "../utils/functions/page";
import { percentChance } from "../utils/functions/random";
import sleep from "../utils/functions/sleep";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import dayjs = require("dayjs");
import ms = require("ms");

const cmd = new Command("karmashop", "buy stuff with your karma", "money").setAliases(["ks"]);

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
          .setAutocomplete(true),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);
  if (message.author.id == Constants.TEKOH_ID) {
    if (args[0] && args[0].toLowerCase() == "open") {
      return openKarmaShop(message.client as NypsiClient, true);
    } else if (args[0] && args[0].toLowerCase() == "close") {
      return closeKarmaShop();
    }
  }

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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if (!(await isKarmaShopOpen())) {
    await addCooldown(cmd.name, message.member, 5);
    const embed = new CustomEmbed(message.member);

    embed.setDescription(
      `the karma shop is currently **closed**, it was last open at <t:${Math.floor(
        dayjs(await getLastKarmaShopOpen())
          .set("seconds", 0)
          .unix(),
      )}>\n\nwill **next open at** <t:${Math.floor(
        dayjs(await getNextKarmaShopOpen())
          .set("seconds", 0)
          .unix(),
      )}> (<t:${Math.floor(
        dayjs(await getNextKarmaShopOpen())
          .set("seconds", 0)
          .unix(),
      )}:R>)`,
    );

    return send({ embeds: [embed] });
  }

  const items = await getKarmaShopItems();

  const itemIDs = Array.from(Object.keys(items));

  const getUserLimit = (item: KarmaShopItem, items: { [key: string]: KarmaShopItem }) => {
    let count = item.bought.filter((i) => i === message.author.id).length;

    if (item.type === "premium") {
      for (const item of Array.from(Object.values(items)).filter((i) => i.type === "premium")) {
        if (item.bought.includes(message.author.id)) {
          count = 1;
          break;
        }
      }
    }

    return count;
  };

  const showShop = async () => {
    inPlaceSort(itemIDs).desc((i) => items[i].items_left);

    const pages = PageManager.createPages(
      itemIDs.map((i) => items[i]),
      6,
    );

    const embed = new CustomEmbed(message.member);

    embed.setHeader("karma shop", message.author.avatarURL());
    embed.setFooter({
      text: `page 1/${pages.size} | you have ${(
        await getKarma(message.member)
      ).toLocaleString()} karma`,
    });

    for (const item of pages.get(1)) {
      embed.addField(
        item.id,
        `${item.emoji} **${item.name}**\n` +
          `**cost** ${item.cost.toLocaleString()} karma\n` +
          `*${item.items_left}* available\n` +
          `${getUserLimit(item, items)}/${item.limit}`,
        true,
      );
    }

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
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

        const newEmbed = new CustomEmbed(message.member).setHeader(
          "karma shop",
          message.author.avatarURL(),
        );

        if (!reaction) return;

        if (reaction == "⬅") {
          if (currentPage <= 1) {
            return pageManager();
          } else {
            currentPage--;
            for (const item of pages.get(currentPage)) {
              newEmbed.addField(
                item.id,
                `${item.emoji} **${item.name}**\n` +
                  `**cost** ${item.cost.toLocaleString()} karma\n` +
                  `*${item.items_left}* available\n` +
                  `${getUserLimit(item, items)}/${item.limit}`,
                true,
              );
            }
            newEmbed.setFooter({
              text: `page ${currentPage}/${pages.size} | you have ${(
                await getKarma(message.member)
              ).toLocaleString()} karma`,
            });
            if (currentPage == 1) {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("⬅")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId("➡")
                  .setLabel("next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
              );
            } else {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("⬅")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId("➡")
                  .setLabel("next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
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
                `${item.emoji} **${item.name}**\n` +
                  `**cost** ${item.cost.toLocaleString()} karma\n` +
                  `*${item.items_left}* available\n` +
                  `${getUserLimit(item, items)}/${item.limit}`,
                true,
              );
            }
            newEmbed.setFooter({
              text: `page ${currentPage}/${pages.size} | you have ${(
                await getKarma(message.member)
              ).toLocaleString()} karma`,
            });
            if (currentPage == lastPage) {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("⬅")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId("➡")
                  .setLabel("next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true),
              );
            } else {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("⬅")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId("➡")
                  .setLabel("next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
              );
            }
            await msg.edit({ embeds: [newEmbed], components: [row] });
            return pageManager();
          }
        }
      };
      return pageManager();
    }
  };

  const buyItem = async (itemId: string, attempts = 1): Promise<any> => {
    if (await redis.exists(Constants.redis.nypsi.KARMA_SHOP_BUYING)) {
      await sleep(15);
      if (attempts > 500) {
        await redis.del(Constants.redis.nypsi.KARMA_SHOP_BUYING);
        attempts = 0;
      }
      return buyItem(itemId, attempts++);
    }

    await redis.set(Constants.redis.nypsi.KARMA_SHOP_BUYING, "meow");

    const items = await getKarmaShopItems();
    const wanted = items[itemId];

    if (wanted.items_left < 1) {
      await redis.del(Constants.redis.nypsi.KARMA_SHOP_BUYING);
      return send({ embeds: [new ErrorEmbed(`there is no ${wanted.name} left`)] });
    }

    if (getUserLimit(wanted, items) >= wanted.limit) {
      await redis.del(Constants.redis.nypsi.KARMA_SHOP_BUYING);
      return send({ embeds: [new ErrorEmbed(`you have hit the user limit for ${wanted.name}`)] });
    }

    if ((await getKarma(message.member)) < wanted.cost) {
      await redis.del(Constants.redis.nypsi.KARMA_SHOP_BUYING);
      return send({ embeds: [new ErrorEmbed(`you cannot afford ${wanted.name}`)] });
    }

    items[wanted.id].items_left -= 1;
    items[wanted.id].bought.push(message.author.id);

    await removeKarma(message.member, wanted.cost);
    await setKarmaShopItems(items);
    await redis.del(Constants.redis.nypsi.KARMA_SHOP_BUYING);
    addProgress(message.author.id, "wizard", 1);
    const guild = await getGuildName(message.member);

    switch (wanted.type) {
      case "item":
      case "premium":
        await addInventoryItem(message.member, wanted.value, 1);
        break;
      case "xp":
        await addXp(message.member, parseInt(wanted.value));
        if (guild) {
          await addToGuildXP(guild, parseInt(wanted.value), message.member);
        }
        break;
    }

    if (
      percentChance(0.05) &&
      (await getDmSettings(message.member)).other &&
      !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))
    ) {
      await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t");
      await redis.expire(Constants.redis.nypsi.GEM_GIVEN, Math.floor(ms("1 days") / 1000));
      await addInventoryItem(message.member, "purple_gem", 1);
      addProgress(message.author.id, "gem_hunter", 1);
      addNotificationToQueue({
        memberId: message.author.id,
        payload: {
          embed: new CustomEmbed(
            message.member,
            `${
              getItems()["purple_gem"].emoji
            } you've found a gem! i wonder what powers it holds...`,
          )
            .setTitle("you've found a gem")
            .setColor(Constants.TRANSPARENT_EMBED_COLOR),
        },
      });
    }

    return await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have bought ${wanted.emoji} ${wanted.name} for ${wanted.cost} karma`,
        ),
      ],
    });
  };

  if (args[0]?.toLowerCase() == "buy") {
    if (message.author.createdTimestamp > dayjs().subtract(7, "day").valueOf()) {
      return send({
        embeds: [new ErrorEmbed("your account must be at least 1 week old to access karma shop")],
      });
    }

    if ((await getRawLevel(message.member)) < 1) {
      return send({
        embeds: [new ErrorEmbed("you must be at least level 1 to access karma shop")],
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
      } else if (items[itemName].aliases) {
        for (const alias of items[itemName].aliases) {
          if (alias === searchTag) {
            selected = itemName;
            break;
          }
        }
      }
    }

    selected = items[selected];

    if (!selected) {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
    }

    if ((await getKarma(message.member)) < selected.cost) {
      return send({ embeds: [new ErrorEmbed("you cannot afford this")] });
    }

    await addCooldown(cmd.name, message.member, 5);

    return buyItem(selected.id);
  } else {
    return showShop();
  }
}

cmd.setRun(run);

module.exports = cmd;
