import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { KarmaShopItem } from "../types/Karmashop";
import Constants from "../utils/Constants";
import { addProgress } from "../utils/functions/economy/achievements";
import { hasGemBeenGiven, markGemAsGiven } from "../utils/functions/economy/gems";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds";
import { addInventoryItem, addItemSourceStat } from "../utils/functions/economy/inventory";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addXp } from "../utils/functions/economy/xp";
import { getPrefix } from "../utils/functions/guilds/utils";
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
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { percentChance } from "../utils/functions/random";
import sleep from "../utils/functions/sleep";
import { escapeFormattingCharacters } from "../utils/functions/string";
import { addNotificationToQueue } from "../utils/functions/users/notifications";
import { getPreferences } from "../utils/functions/users/preferences";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");

const cmd = new Command("karma", "check your karma and browse the karma shop", "money")
  .setDocs("https://nypsi.xyz/wiki/economy/karma?ref=bot-help")
  .setShorthands({
    karmashop: "karma shop",
    ks: "karma shop",
    karmahelp: "karma help",
  });

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((sub) =>
    sub
      .setName("balance")
      .setDescription("check how much karma you have")
      .addUserOption((option) =>
        option.setName("user").setDescription("user to get karma of (defaults to you)"),
      ),
  )
  .addSubcommand((sub) => sub.setName("shop").setDescription("view the karma shop"))
  .addSubcommand((sub) =>
    sub
      .setName("buy")
      .setDescription("buy something from the karma shop")
      .addStringOption((option) =>
        option
          .setName("item-karmashop")
          .setDescription("item you want to buy from the karma shop")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("help").setDescription("view information about the karma system"),
  );

cmd.setRun(async (message, send, args) => {
  let action = "balance";
  let inputs = args;

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    action = message.options.getSubcommand();
    inputs = [];
    if (action === "balance") {
      const user = message.options.getUser("user");
      if (user) inputs = [`<@${user.id}>`];
    } else if (action === "buy") {
      inputs = [message.options.getString("item-karmashop", true)];
    }
  } else if (["balance", "shop", "buy", "help"].includes(args[0]?.toLowerCase())) {
    action = args[0].toLowerCase();
    inputs = args.slice(1);
  }

  switch (action) {
    case "help":
      return runHelp(message, send);
    case "shop":
      if (inputs[0]?.toLowerCase() === "help") return runHelp(message, send);
      return runShop(message, send, inputs);
    case "buy":
      return runShop(message, send, ["buy", ...inputs]);
    default:
      return runBalance(message, send, inputs);
  }
});

async function runBalance(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let target = message.member;

  if (args.length >= 1) {
    target = await getMember(message.guild, args.join(" "));

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  const karma = await getKarma(target);

  const embed = new CustomEmbed(message.member);

  if (target.user.id == message.author.id) {
    embed.setHeader("your karma", message.author.avatarURL());
    embed.setDescription(`you have **${karma.toLocaleString()}** karma 🔮`);
  } else {
    embed.setHeader(`${target.user.username}'s karma`, target.user.avatarURL());
    embed.setDescription(
      `${escapeFormattingCharacters(target.user.username)} has **${karma.toLocaleString()}** karma 🔮`,
    );
  }

  embed.setFooter({ text: `whats karma? do ${(await getPrefix(message.guild))[0]}karma help` });

  return send({ embeds: [embed] });
}

async function runHelp(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  const embed = new CustomEmbed(message.member).setTitle("karma help");

  embed.setDescription(
    "karma is an xp-like system that rewards you for simply using nypsi\n\ninteraction with nypsi in different ways rewards you with different amounts of karma\n\nif you stop using nypsi for a period of time, your karma will deteriorate over time\n\n**what is karma used for?**\noccasionally, the karma shop will be opened, allowing you to buy things with your karma, such as premium membership, xp, crates and rare items\n\nhttps://nypsi.xyz/wiki/economy/karma?ref=bot-karmahelp",
  );

  embed.setFooter({ text: `${(await getPrefix(message.guild))[0]}karma shop` });

  return send({ embeds: [embed] });
}

async function runShop(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);
  if (message.author.id == Constants.OWNER_ID) {
    if (args[0] && args[0].toLowerCase() == "open") {
      return openKarmaShop(message.client as NypsiClient, true);
    } else if (args[0] && args[0].toLowerCase() == "close") {
      return closeKarmaShop();
    }
  }

  if (await onCooldown("karmashop", message.member)) {
    const res = await getResponse("karmashop", message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!(await isKarmaShopOpen())) {
    await addCooldown("karmashop", message.member, 5);
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
        .setCustomId("btn-previous-page")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("btn-next-page")
        .setLabel("next")
        .setStyle(ButtonStyle.Primary),
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

        if (reaction == "btn-previous-page") {
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
                  .setCustomId("btn-previous-page")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId("btn-next-page")
                  .setLabel("next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
              );
            } else {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("btn-previous-page")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId("btn-next-page")
                  .setLabel("next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
              );
            }
            await msg.edit({ embeds: [newEmbed], components: [row] });
            return pageManager();
          }
        } else if (reaction == "btn-next-page") {
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
                  .setCustomId("btn-previous-page")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId("btn-next-page")
                  .setLabel("next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true),
              );
            } else {
              row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("btn-previous-page")
                  .setLabel("back")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId("btn-next-page")
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
    addProgress(message.member, "wizard", 1);
    const guild = await getGuildName(message.member);

    switch (wanted.type) {
      case "item":
      case "premium":
        await addInventoryItem(message.member, wanted.value, 1);
        addItemSourceStat(wanted.value, "karma_shop", 1);
        break;
      case "xp":
        await addXp(message.member, wanted.value);
        if (guild) {
          await addToGuildXP(guild, wanted.value, message.member);
        }
        break;
    }

    if (
      percentChance(0.05) &&
      !(await hasGemBeenGiven()) &&
      (await getPreferences(message.member)).dms.other &&
      !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))
    ) {
      await markGemAsGiven();
      logger.info(`${message.author.id} received purple_gem randomly (karmashop)`);
      await addInventoryItem(message.member, "purple_gem", 1);
      addItemSourceStat("purple_gem", "karma_shop", 1);
      addProgress(message.member, "gem_hunter", 1);
      addNotificationToQueue({
        memberId: message.author.id,
        payload: {
          embed: new CustomEmbed(
            message.member,
            `${
              getItems()["purple_gem"].emoji
            } you've found a gem! i wonder what powers it holds...`,
          ).setTitle("you've found a gem"),
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

    if (args.length == 1) {
      return send({
        embeds: [new ErrorEmbed("/karma buy <item>")],
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

    await addCooldown("karmashop", message.member, 5);

    return buyItem(selected.id);
  }

  return showShop();
}

module.exports = cmd;
