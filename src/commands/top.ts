import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { Item } from "../types/Economy.js";
import {
  topBalance,
  topCompletion,
  topItem,
  topNetWorth,
  topNetWorthGlobal,
  topPrestige,
  topPrestigeGlobal,
} from "../utils/functions/economy/top";
import { getItems } from "../utils/functions/economy/utils.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("top", "view top etc. in the server", Categories.MONEY).setAliases(["baltop", "gangsters"]);

const scopeChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: "global", value: "global" },
  { name: "server", value: "server" },
];

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((balance) => balance.setName("balance").setDescription("view top balances in the server"))
  .addSubcommand((prestige) =>
    prestige
      .setName("prestige")
      .setDescription("view top prestiges in the server")

      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false)
      )
  )
  .addSubcommand((item) =>
    item
      .setName("item")
      .setDescription("view top item holders in the server")
      .addStringOption((option) =>
        option.setName("item-global").setDescription("item to query").setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((completion) => completion.setName("completion").setDescription("view top completion in the server"))
  .addSubcommand((networth) =>
    networth
      .setName("networth")
      .setDescription("view top networths in the server")

      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("show global/server")
          .setChoices(...scopeChoices)
          .setRequired(false)
      )
  );

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
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

  await addCooldown(cmd.name, message.member, 15);

  const show = async (pages: Map<number, string[]>, pos: number, title: string) => {
    const embed = new CustomEmbed(message.member).setHeader(
      title,
      title.includes("global") ? message.guild.iconURL() : message.client.user.avatarURL()
    );

    if (pages.size == 0) {
      embed.setDescription("no data to show");
    } else {
      embed.setDescription(pages.get(1).join("\n"));
    }

    if (pos != 0) {
      embed.setFooter({ text: `you are #${pos}` });
    }

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    if (pages.size == 1) {
      return send({ embeds: [embed] });
    }

    const msg = await send({ embeds: [embed], components: [row] });

    const filter = (i: Interaction) => i.user.id == message.author.id;
    let currentPage = 1;

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
          await msg.edit({ embeds: [embed], components: [row] });
          return pageManager();
        }
      } else if (reaction == "➡") {
        if (currentPage >= pages.size) {
          return pageManager();
        } else {
          currentPage++;

          embed.setDescription(pages.get(currentPage).join("\n"));

          if (currentPage == pages.size) {
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
          await msg.edit({ embeds: [embed], components: [row] });
          return pageManager();
        }
      }
    };

    return pageManager();
  };

  if (args.length == 0) {
    const data = await topBalance(message.guild, message.author.id);

    return show(data.pages, data.pos, `top balance for ${message.guild.name}`);
  } else if (args[0].toLowerCase() == "balance") {
    const data = await topBalance(message.guild, message.author.id);

    return show(data.pages, data.pos, `top balance for ${message.guild.name}`);
  } else if (args[0].toLowerCase() == "prestige") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topPrestigeGlobal(message.author.id);
    } else {
      data = await topPrestige(message.guild, message.author.id);
    }

    return show(data.pages, data.pos, `top prestige ${global ? "[global]" : `for ${message.guild.name}`}`);
  } else if (args[0].toLowerCase() == "item") {
    const items = getItems();
    const searchTag = args[1].toLowerCase();

    let item: Item;

    for (const itemName of Array.from(Object.keys(items))) {
      const aliases = items[itemName].aliases ? items[itemName].aliases : [];
      if (searchTag == itemName) {
        item = items[itemName];
        break;
      } else if (searchTag == itemName.split("_").join("")) {
        item = items[itemName];
        break;
      } else if (aliases.indexOf(searchTag) != -1) {
        item = items[itemName];
        break;
      } else if (searchTag == items[itemName].name) {
        item = items[itemName];
        break;
      }
    }

    if (!item) {
      return send({ embeds: [new ErrorEmbed(`couldn't find ${searchTag}`)] });
    }

    const data = await topItem(message.guild, item.id, message.author.id);

    return show(data.pages, data.pos, `top ${item.name} in ${message.guild.name}`);
  } else if (args[0].toLowerCase() == "completion") {
    const data = await topCompletion(message.guild, message.author.id);

    return show(data.pages, data.pos, `top completion in ${message.guild.name}`);
  } else if (args[0].toLowerCase() == "net" || args[0].toLowerCase() == "networth") {
    let global = false;

    if (args[1]?.toLowerCase() == "global") global = true;

    let data: { pages: Map<number, string[]>; pos: number };

    if (global) {
      data = await topNetWorthGlobal(message.author.id);
    } else {
      data = await topNetWorth(message.guild, message.author.id);
    }

    return show(data.pages, data.pos, `top net worth ${global ? "[global]" : `for ${message.guild.name}`}`);
  }
}

cmd.setRun(run);

module.exports = cmd;
