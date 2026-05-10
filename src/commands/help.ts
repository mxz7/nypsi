import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command } from "../models/Command.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { Item } from "../types/Economy.js";
import Constants from "../utils/Constants.js";
import { isHelpChatAvailable } from "../utils/functions/ai/help-chat.js";
import { formatDate } from "../utils/functions/date.js";
import { runItemInfo } from "../utils/functions/economy/item_info.js";
import { getItems } from "../utils/functions/economy/utils.js";
import { getPrefix } from "../utils/functions/guilds/utils.js";
import { getNews } from "../utils/functions/news.js";
import { getCommand } from "../utils/functions/premium/command.js";
import {
  commandAliasExists,
  commandExists,
  getCmdCategory,
  getCmdDesc,
  getCmdName,
  getCommandData,
  getCommandFromAlias,
  getCommandKeys,
} from "../utils/handlers/commandhandler.js";

const cmd = new Command("help", "view all commands and their information", "info");

cmd.setRun(async (message, send, args) => {
  if (!(message instanceof Message)) return;

  const helpCategories = new Map<string, Map<number, string[]>>();

  const prefix = (await getPrefix(message.guild))[0];

  for (const cmdKey of getCommandKeys()) {
    const category = getCmdCategory(cmdKey);

    if (category == "none") continue;

    if (helpCategories.has(category)) {
      const current = helpCategories.get(category);
      const lastPage = current.get(current.size);

      if (lastPage.length == 10) {
        const newPage = [];

        newPage.push(`${prefix}**${getCmdName(cmdKey)}** *${getCmdDesc(cmdKey)}*`);
        current.set(current.size + 1, newPage);
      } else {
        const page = current.get(current.size);
        page.push(`${prefix}**${getCmdName(cmdKey)}** *${getCmdDesc(cmdKey)}*`);
        current.set(current.size, page);
      }

      helpCategories.set(category, current);
    } else {
      const pages = new Map<number, string[]>();

      pages.set(1, [`${prefix}**${getCmdName(cmdKey)}** *${getCmdDesc(cmdKey)}*`]);

      helpCategories.set(category, pages);
    }
  }

  const embed = new CustomEmbed(message.member);

  let pageSystemNeeded = false;

  if (args.length == 0) {
    const categories = Array.from(helpCategories.keys()).sort();

    let categoriesMsg = "";

    for (const category of categories) {
      categoriesMsg += `» ${prefix}help **${category}**\n`;
    }

    const news = await getNews();

    embed.setTitle("help menu");
    embed.setDescription(
      "[invite nypsi to your server](https://discord.com/oauth2/authorize?client_id=678711738845102087&permissions=1377879583830&scope=bot%20applications.commands)\n\n" +
        `if you need support, want to report a bug or suggest a feature, you can join the nypsi server: ${Constants.NYPSI_SERVER_INVITE_LINK}\n\n` +
        `my prefix for this server is \`${prefix}\``,
    );
    embed.addField("command categories", categoriesMsg, true);
    embed.setThumbnail(message.client.user.displayAvatarURL({ size: 128 }));

    if (news.text != "") {
      embed.addField("news", `${news.text} - *${formatDate(news.date)}*`);
    }
  } else {
    if (args[0].toLowerCase() == "mod") args[0] = "moderation";
    if (args[0].toLowerCase() == "util") args[0] = "utility";
    if (args[0].toLowerCase() == "pictures") args[0] = "animals";
    if (args[0].toLowerCase() == "eco") args[0] = "money";
    if (args[0].toLowerCase() == "economy") args[0] = "money";
    if (args[0].toLowerCase() == "gamble") args[0] = "money";
    if (args[0].toLowerCase() == "gambling") args[0] = "money";

    const items = getItems();

    let selectedItem: Item;
    const searchTag = args.join(" ");

    for (const itemName of Array.from(Object.keys(items))) {
      const aliases = items[itemName].aliases ? items[itemName].aliases : [];
      if (searchTag == itemName) {
        selectedItem = items[itemName];
        break;
      } else if (searchTag == itemName.split("_").join("")) {
        selectedItem = items[itemName];
        break;
      } else if (aliases.indexOf(searchTag) != -1) {
        selectedItem = items[itemName];
        break;
      } else if (searchTag == items[itemName].name) {
        selectedItem = items[itemName];
        break;
      }
    }

    if (helpCategories.has(args[0].toLowerCase())) {
      const pages = helpCategories.get(args[0].toLowerCase());

      if (pages.size > 1) {
        pageSystemNeeded = true;
      }

      embed.setTitle(`${args[0].toLowerCase()} commands`);
      embed.setDescription(pages.get(1).join("\n"));
      embed.setFooter({ text: `page 1/${pages.size}` });
    } else if (commandExists(args[0].toLowerCase()) || commandAliasExists(args[0].toLowerCase())) {
      let command: Command;

      if (commandAliasExists(args[0].toLowerCase())) {
        command = getCommandData(getCommandFromAlias(args[0].toLowerCase()));
      } else {
        command = getCommandData(args[0].toLowerCase());
      }

      let desc =
        "**name** " +
        command.name +
        "\n" +
        "**description** " +
        command.description +
        "\n" +
        "**category** " +
        command.category;

      if (command.permissions) {
        desc = desc + "\n**permission(s) required** `" + command.permissions.join("`, `") + "`";
      }

      if (command.aliases) {
        desc = desc + "\n**aliases** `" + prefix + command.aliases.join("`, `" + prefix) + "`";
      }

      if (command.docs) {
        desc += `\n**wiki** ${command.docs}`;
      }

      embed.setTitle(`${command.name} command`);
      embed.setDescription(desc);
    } else if (await getCommand(args[0].toLowerCase())) {
      const owner = (await getCommand(args[0].toLowerCase())).owner;
      const member = message.guild.members.cache.find((m) => m.id == owner);
      embed.setTitle("custom command");
      embed.setDescription(
        `this is a custom command${
          member ? ` owned by ${member.toString()}` : ""
        }\n\nto disable custom commands in your server you can do:\n${prefix}disablecmd + customcommand`,
      );
    } else if (selectedItem) {
      return await runItemInfo(message, args, selectedItem, "general");
    } else {
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            "unknown command or item\nyou may find what you're looking for on the wiki: https://nypsi.xyz/wiki",
          ),
        ],
      });
    }
  }

  let msg: Message;

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  if (pageSystemNeeded) {
    msg = await message.channel.send({
      embeds: [embed],
      components: [row],
    });
  } else {
    if (args.length === 0) {
      const components = [];

      if (await isHelpChatAvailable()) {
        components.push(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("help-ai-start")
              .setLabel("ask ai")
              .setStyle(ButtonStyle.Secondary),
          ),
        );
      }

      return await message.channel.send({ embeds: [embed], components });
    }

    return await message.channel.send({ embeds: [embed] });
  }

  const pages = helpCategories.get(args[0].toLowerCase());

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
        await msg.edit({ components: [] }).catch(() => {});
      });

    if (!reaction) return;

    if (reaction == "⬅") {
      if (currentPage <= 1) {
        return pageManager();
      } else {
        currentPage--;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `page ${currentPage}/${lastPage}` });
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
        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      }
    } else if (reaction == "➡") {
      if (currentPage >= lastPage) {
        return pageManager();
      } else {
        currentPage++;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `page ${currentPage}/${lastPage}` });
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
        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      }
    }
  };

  return pageManager();
});

module.exports = cmd;
