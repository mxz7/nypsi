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
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getCraftingItems, newCraftItem } from "../utils/functions/economy/crafting";
import { getInventory, selectItem, setInventoryItem } from "../utils/functions/economy/inventory";
import { addItemUse } from "../utils/functions/economy/stats";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("craft", "craft items", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) => option.setName("craft-item").setAutocomplete(true).setDescription("item to craft"))
  .addStringOption((option) => option.setName("amount").setDescription("amount of item you want to craft"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 10);

  const items = getItems();
  const craftableItemIds = Object.keys(items).filter((i) => items[i].craft);

  const craftingPage = async (msg: Message) => {
    const { current: crafting } = await getCraftingItems(message.member);

    const embed = new CustomEmbed(message.member).setHeader("currently crafting", message.author.avatarURL());

    const desc: string[] = [];

    for (const craftingItem of crafting) {
      desc.push(
        `\`${craftingItem.amount.toLocaleString()}x\` ${items[craftingItem.itemId].emoji} ${
          items[craftingItem.itemId].name
        } finished <t:${Math.floor(craftingItem.finished.getTime() / 1000)}:R>`
      );
    }

    embed.setDescription(desc.join("\n"));

    const components = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("bck").setLabel("back").setStyle(ButtonStyle.Primary)
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
    const inventory = await getInventory(message.member);
    const crafting = await getCraftingItems(message.member);

    if (crafting.completed.length > 0) {
      const desc: string[] = [];

      for (const completed of crafting.completed) {
        desc.push(`\`${completed.amount}x\` ${items[completed.itemId].emoji} ${items[completed.itemId].name}`);
      }

      embed.addField("completed", desc.join("\n"));
    }

    const availableToCraft: string[] = [];

    for (const itemId of craftableItemIds) {
      const ingrediants = items[itemId].craft.ingrediants.map((i) => i.split(":")[0]);

      let item = `${items[itemId].emoji} **${items[itemId].name}**`;

      const owned = new Map<string, number>();
      let isZero = 0;

      for (const ingrediantId of ingrediants) {
        const ownedAmount = inventory.find((i) => i.item == ingrediantId)?.amount || 0;

        owned.set(ingrediantId, ownedAmount);

        if (ownedAmount == 0) isZero++;
      }

      if (isZero == ingrediants.length) continue;

      let craftable = 1e10;

      for (const [key, value] of owned.entries()) {
        const needed = parseInt(items[itemId].craft.ingrediants.find((i) => i.split(":")[0] == key).split(":")[1]);

        item += `\n - ${items[key].emoji} ${items[key].name} \`${value.toLocaleString()} / ${needed}\``;

        const recipeAvailableToCraft = Math.floor(value / needed);

        if (recipeAvailableToCraft < craftable) craftable = recipeAvailableToCraft;
      }

      if (craftable != 0) {
        item += `\n${craftable.toLocaleString()} craftable`;
      }

      availableToCraft.push(item);
    }

    const pages = new Map<number, string[]>();

    if (availableToCraft.length == 0) {
      availableToCraft.push("you can not currently craft anything. collect more items to discover craftable items");
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
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
      );

      embed.setFooter({ text: `1/${pages.size}` });
    }

    if (crafting.current.length > 0) {
      components[pages.size > 1 ? 1 : 0] = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("prog").setLabel("currently crafting").setStyle(ButtonStyle.Success)
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
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
            );
          } else {
            components[0].setComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
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
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
            );
          } else {
            components[0].setComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
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
            }`
          ),
        ],
      });
    }

    const selected = selectItem(args[0].toLowerCase());

    if (!selected) {
      return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0].toLowerCase()}\``)] });
    }

    if (!selected.craft) {
      return send({ embeds: [new ErrorEmbed("you cannot craft that item")] });
    }

    const owned = new Map<string, number>();
    const inventory = await getInventory(message.member, false);

    for (const ingrediantId of selected.craft.ingrediants) {
      const ownedAmount = inventory.find((i) => i.item == ingrediantId.split(":")[0])?.amount || 0;

      owned.set(ingrediantId, ownedAmount);
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
      return send({ embeds: [new ErrorEmbed(`you can only craft ${craftable.toLocaleString()} ${selected.name}`)] });
    }

    const promises: Promise<any>[] = [];

    for (const ingrediant of selected.craft.ingrediants) {
      const item = ingrediant.split(":")[0];
      const ingrediantAmount = parseInt(ingrediant.split(":")[1]);

      promises.push(
        setInventoryItem(
          message.member,
          item,
          inventory.find((i) => i.item == item).amount - amount * ingrediantAmount,
          false
        )
      );

      promises.push(addItemUse(message.member, item, amount).catch(() => {}));
    }

    await Promise.all(promises);

    const craft = await newCraftItem(message.member, selected.id, amount);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `\`${amount.toLocaleString()}x\` ${selected.emoji} ${
            amount > 1 ? selected.plural || selected.name : selected.name
          } will be crafted <t:${Math.floor(craft.finished.getTime() / 1000)}:R>`
        ),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
