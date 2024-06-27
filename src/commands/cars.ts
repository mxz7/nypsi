import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("cars", "view the current cars available", "money").setAliases(["car"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 10);

  let page = 0;

  if (args.length == 1) {
    if (!parseInt(args[0])) {
      page = 1;
    } else {
      page = parseInt(args[0]) - 1;
      if (page < 0) {
        page = 0;
      }
    }
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  const items = getItems();
  const inventory = await getInventory(message.member);

  const itemIDs = Array.from(Object.keys(items));

  inPlaceSort(itemIDs).asc();

  const pages: string[][] = [];
  let totalCars = 0;
  let totalOwned = 0;

  let pageOfItems: string[] = [];
  for (const item of itemIDs) {
    if (item === "cycle") continue;
    if (items[item].role != "car") continue;
    totalCars++;

    if (inventory.find((i) => i.item == item) && inventory.find((i) => i.item == item).amount > 0)
      totalOwned++;

    if (pageOfItems.length == 6) {
      pages.push(pageOfItems);
      pageOfItems = [item];
    } else {
      pageOfItems.push(item);
    }
  }

  if (pageOfItems.length != 0) {
    pages.push(pageOfItems);
  }

  const embed = new CustomEmbed(message.member).setFooter({
    text: `page ${page + 1}/${pages.length} | owned: ${totalOwned}/${totalCars}`,
  });

  embed.setHeader("car magazine", message.author.avatarURL());

  if (!pages[page]) {
    page = 0;
  }

  for (const i of pages[page]) {
    let owned = false;
    const item = items[i];

    if (
      inventory.find((i) => i.item == item.id) &&
      inventory.find((i) => i.item == item.id).amount > 0
    )
      owned = true;

    embed.addField(
      item.id,
      `${item.emoji} **${item.name}**\n${item.longDesc}\n**speed** ${item.speed}${
        owned ? "\n*owned*" : ""
      }`,
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

  if (pages.length == 1) {
    return await message.channel.send({ embeds: [embed] });
  } else {
    msg = await message.channel.send({ embeds: [embed], components: [row] });
  }

  if (pages.length > 1) {
    let currentPage = page;

    const lastPage = pages.length;

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
        "car magazine",
        message.author.avatarURL(),
      );

      if (!reaction) return;

      if (reaction == "⬅") {
        if (currentPage <= 0) {
          return pageManager();
        } else {
          currentPage--;
          for (const i of pages[currentPage]) {
            let owned = false;
            const item = items[i];

            if (
              inventory.find((i) => i.item == item.id) &&
              inventory.find((i) => i.item == item.id).amount > 0
            )
              owned = true;

            newEmbed.addField(
              item.id,
              `${item.emoji} **${item.name}**\n${item.longDesc}\n**speed** ${item.speed}${
                owned ? "\n*owned*" : ""
              }`,
              true,
            );
          }
          newEmbed.setFooter({
            text: `page ${currentPage + 1}/${pages.length} | owned: ${totalOwned}/${totalCars}`,
          });
          if (currentPage == 0) {
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
        if (currentPage + 1 >= lastPage) {
          return pageManager();
        } else {
          currentPage++;
          for (const i of pages[currentPage]) {
            let owned = false;
            const item = items[i];

            if (
              inventory.find((i) => i.item == item.id) &&
              inventory.find((i) => i.item == item.id).amount > 0
            )
              owned = true;

            newEmbed.addField(
              item.id,
              `${item.emoji} **${item.name}**\n${item.longDesc}\n**speed** ${item.speed}${
                owned ? "\n*owned*" : ""
              }`,
              true,
            );
          }
          newEmbed.setFooter({
            text: `page ${currentPage + 1}/${pages.length} | owned: ${totalOwned}/${totalCars}`,
          });
          if (currentPage + 1 == lastPage) {
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
}

cmd.setRun(run);

module.exports = cmd;
