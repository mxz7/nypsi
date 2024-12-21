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
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getCraftingItems, newCraftItem } from "../utils/functions/economy/crafting";
import { getInventory, selectItem, setInventoryItem } from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("craft", "craft items", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option.setName("craft-item").setAutocomplete(true).setDescription("item to craft"),
  )
  .addStringOption((option) =>
    option.setName("amount").setDescription("amount of item you want to craft"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

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
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  const items = getItems();
  const craftableItemIds = Object.keys(items).filter((i) => items[i].craft);

  const craftingPage = async (msg: Message) => {
    const { current: crafting } = await getCraftingItems(message.member);

    const embed = new CustomEmbed(message.member).setHeader(
      "currently crafting",
      message.author.avatarURL(),
    );

    const desc: string[] = [];

    for (const craftingItem of crafting) {
      desc.push(
        `\`${craftingItem.amount.toLocaleString()}x\` ${items[craftingItem.itemId].emoji} ${
          items[craftingItem.itemId].name
        } finished <t:${Math.floor(craftingItem.finished.getTime() / 1000)}:R>`,
      );
    }

    embed.setDescription(desc.join("\n"));

    const components = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("bck").setLabel("back").setStyle(ButtonStyle.Primary),
      ),
    ];

    msg = await msg.edit({ embeds: [embed], components });

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager = async (): Promise<void> => {
      const reaction = await msg
        .awaitMessageComponent({ filter, time: 30000 })
        .then(async (collected) => {
          await collected.deferUpdate();
          return collected;
        })
        .catch(async () => {
          const edit = async (data: MessageEditOptions) => {
            if (!(message instanceof Message)) {
              await message.editReply(data);
              return await message.fetchReply();
            } else {
              return await msg.edit(data);
            }
          };
          await edit({ components: [] }).catch(() => {});
        });

      if (!reaction) return;
      if (!reaction.isButton()) return;

      if (reaction.customId == "bck") {
        mainPage(msg);
        return;
      }
    };
    return pageManager();
  };

  const mainPage = async (msg?: Message) => {
    const embed = new CustomEmbed(message.member).setHeader("craft", message.author.avatarURL());
    const [inventory, crafting] = await Promise.all([
      getInventory(message.member),
      getCraftingItems(message.member),
    ]);

    if (crafting.completed.length > 0) {
      const desc: string[] = [];

      for (const completed of crafting.completed) {
        desc.push(
          `\`${completed.amount}x\` ${items[completed.itemId].emoji} ${
            items[completed.itemId].name
          }`,
        );
      }

      embed.addField("completed", desc.join("\n"));
    }

    const availableToCraftUnsorted: [string, number][] = [];

    for (const itemId of craftableItemIds) {
      const ingredients = items[itemId].craft.ingredients.map((i) => i.split(":")[0]);

      let item = `${items[itemId].emoji} **${items[itemId].name}**`;

      const owned = new Map<string, number>();
      let isZero = 0;

      for (const ingredientId of ingredients) {
        const ownedAmount = inventory.find((i) => i.item == ingredientId)?.amount || 0;

        owned.set(ingredientId, ownedAmount);

        if (ownedAmount == 0) isZero++;
      }

      if (isZero == ingredients.length) continue;

      let craftable = 1e10;
      let totalNeeded = 0;
      let totalHas = 0;

      for (const [key, value] of owned.entries()) {
        const needed = parseInt(
          items[itemId].craft.ingredients.find((i) => i.split(":")[0] == key).split(":")[1],
        );

        item += `\n- ${items[key].emoji} ${
          items[key].name
        } \`${value.toLocaleString()} / ${needed}\``;

        const recipeAvailableToCraft = Math.floor(value / needed);

        if (recipeAvailableToCraft < craftable) craftable = recipeAvailableToCraft;
        totalNeeded += needed;
        totalHas += owned.get(key);
      }

      if (craftable != 0) {
        item += `\n${craftable.toLocaleString()} craftable`;
      }

      let score = 0;

      if (craftable > 0) score = craftable * 100;
      else score = totalHas / totalNeeded;

      availableToCraftUnsorted.push([item, score]);
    }

    const availableToCraft = inPlaceSort(availableToCraftUnsorted)
      .desc((i) => i[1])
      .map((i) => i[0]);

    const pages = new Map<number, string[]>();

    if (availableToCraft.length == 0) {
      availableToCraft.push(
        "you can not currently craft anything. collect more items to discover craftable items",
      );
    }

    const PER_PAGE = 4;

    const doPages = (): void => {
      pages.set(pages.size + 1, availableToCraft.splice(0, PER_PAGE));

      if (availableToCraft.length > PER_PAGE) {
        return doPages();
      } else if (availableToCraft.length > 0) {
        pages.set(pages.size + 1, availableToCraft);
      }
    };
    doPages();

    embed.setDescription(pages.get(1).join("\n\n"));

    const components = [new ActionRowBuilder<MessageActionRowComponentBuilder>()];

    if (pages.size > 1) {
      components[0].addComponents(
        new ButtonBuilder()
          .setCustomId("⬅")
          .setLabel("back")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
      );

      embed.setFooter({ text: `1/${pages.size}` });
    }

    if (crafting.current.length > 0) {
      components[pages.size > 1 ? 1 : 0] =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("prog")
            .setLabel("currently crafting")
            .setStyle(ButtonStyle.Success),
        );
    }

    if (msg) {
      if (components[0].components.length > 0 || components[1]) {
        msg = await msg.edit({ embeds: [embed], components });
      } else {
        return msg.edit({ embeds: [embed], components: [] });
      }
    } else {
      if (components[0].components.length > 0 || components[1]) {
        msg = await send({ embeds: [embed], components });
      } else {
        return send({ embeds: [embed], components: [] });
      }
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    let currentPage = 1;

    const pageManager = async (): Promise<void> => {
      const reaction = await msg
        .awaitMessageComponent({ filter, time: 30000 })
        .then(async (collected) => {
          await collected.deferUpdate();
          return collected;
        })
        .catch(async () => {
          const edit = async (data: MessageEditOptions) => {
            if (!(message instanceof Message)) {
              await message.editReply(data);
              return await message.fetchReply();
            } else {
              return await msg.edit(data);
            }
          };
          await edit({ components: [] }).catch(() => {});
        });

      if (!reaction) return;
      if (!reaction.isButton()) return;

      if (reaction.customId == "⬅") {
        if (currentPage <= 1) {
          return pageManager();
        } else {
          currentPage--;

          embed.setDescription(pages.get(currentPage).join("\n\n"));
          embed.setFooter({ text: "page " + currentPage + "/" + pages.size });

          if (currentPage == 1) {
            components[0].setComponents(
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
            components[0].setComponents(
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
          await reaction.message.edit({ embeds: [embed], components });
          return pageManager();
        }
      } else if (reaction.customId == "➡") {
        if (currentPage >= pages.size) {
          return pageManager();
        } else {
          currentPage++;

          embed.setDescription(pages.get(currentPage).join("\n\n"));
          embed.setFooter({ text: "page " + currentPage + "/" + pages.size });
          if (currentPage == pages.size) {
            components[0].setComponents(
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
            components[0].setComponents(
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
          await reaction.message.edit({ embeds: [embed], components });
          return pageManager();
        }
      } else if (reaction.customId == "prog") {
        craftingPage(msg);
        return;
      }
    };
    return pageManager();
  };

  if (args.length == 0) {
    return mainPage();
  } else {
    const crafting = await getCraftingItems(message.member, false);

    let max = 2;

    if (await isPremium(message.member)) {
      max += await getTier(message.member);
    }

    if (crafting.current.length >= max) {
      return send({
        embeds: [
          new ErrorEmbed(
            `you have reached your crafting slots limit (${max})${
              max == 2 ? "\n\nyou can upgrade this with premium membership (`/premium`)" : ""
            }`,
          ),
        ],
      });
    }

    const selected =
      selectItem(args.join(" ")) ||
      selectItem(args.slice(0, args.length - 1).join(" ")) ||
      selectItem(args[0]);

    if (!selected) {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0].toLowerCase()}\``)] });
    }

    if (!selected.craft) {
      return send({ embeds: [new ErrorEmbed("you cannot craft that item")] });
    }

    const owned = new Map<string, number>();
    const inventory = await getInventory(message.member);

    for (const ingredientId of selected.craft.ingredients) {
      const ownedAmount = inventory.find((i) => i.item == ingredientId.split(":")[0])?.amount || 0;

      owned.set(ingredientId, ownedAmount);
    }

    let craftable = 1e10;

    for (const [key, value] of owned.entries()) {
      const needed = parseInt(key.split(":")[1]);

      const recipeAvailableToCraft = Math.floor(value / needed);

      if (recipeAvailableToCraft < craftable) craftable = recipeAvailableToCraft;
    }

    if (craftable == 0) {
      return send({ embeds: [new ErrorEmbed("you cant craft any of this item")] });
    }

    let amount = 1;

    if (args[1]) {
      if (args[1].toLowerCase() == "all") {
        amount = craftable;
      } else {
        amount = parseInt(args[1]);
      }
    }

    if (!amount || amount < 1) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > craftable) {
      return send({
        embeds: [
          new ErrorEmbed(`you can only craft ${craftable.toLocaleString()} ${selected.name}`),
        ],
      });
    }

    const promises: Promise<any>[] = [];

    for (const ingredient of selected.craft.ingredients) {
      const item = ingredient.split(":")[0];
      const ingredientAmount = parseInt(ingredient.split(":")[1]);

      promises.push(
        setInventoryItem(
          message.member,
          item,
          inventory.find((i) => i.item == item).amount - amount * ingredientAmount,
        ),
      );

      promises.push(addStat(message.member, item, amount).catch(() => {}));
    }

    await Promise.all(promises);

    const craft = await newCraftItem(message.member, selected.id, amount);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `\`${amount.toLocaleString()}x\` ${selected.emoji} ${
            amount > 1 ? selected.plural || selected.name : selected.name
          } will be crafted <t:${Math.floor(craft.finished.getTime() / 1000)}:R>`,
        ),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
