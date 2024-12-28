import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import {
  addChatFilterWord,
  checkMessageContent,
  deleteChatFilterWord,
  getChatFilter,
} from "../utils/functions/guilds/filters";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";

const cmd = new Command("chatfilter", "change the chat filter for your server", "admin")
  .setAliases(["filter"])
  .setPermissions(["MANAGE_SERVER"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.channel.send({
        embeds: [new ErrorEmbed("you need the `manage server` permission")],
      });
    }
    return;
  }

  let filter = await getChatFilter(message.guild);
  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const pages = PageManager.createPages(
      inPlaceSort(filter.map((i) => i.content))
        .asc()
        .map((i) => `\`${i}\``),
      15,
    );

    const embed = new CustomEmbed(message.member)
      .setHeader("current chat filter")
      .setFooter({ text: `use ${prefix}filter (add/del/+/-) to modify the filter` });

    if (filter.length == 0) {
      embed.setDescription("`❌` empty chat filter");
    } else {
      embed.setDescription(pages.get(1).join("\n"));
    }

    if (pages.size <= 1) return message.channel.send({ embeds: [embed] });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      embed,
      message: msg,
      row,
      userId: message.author.id,
      pages,
    });

    return manager.listen();
  }

  if (args[0].toLowerCase() == "help") {
    const embed = new CustomEmbed(message.member).setHeader("chat filter help");

    embed.setDescription(
      `${prefix}**filter add/+ <word>** *add a word to the chat filter*\n${prefix}**filter del/- <word>** *remove a word from the chat filter*\n${prefix}**filter reset** *reset the chat filter*\n${prefix}**filter test** *test the chat filter*\n\nyou can use the [web dashboard](https://nypsi.xyz/me/guild/${message.guildId}) for percentage matching`,
    );

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
    if (args.length == 1) {
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            `${prefix}filter add/+ <word> | cAsInG doesn't matter, it'll be filtered either way`,
          ),
        ],
      });
    }

    const word = args.slice(1, args.length).join(" ").toLowerCase().normalize("NFD");

    if (word == "" || word == " ") {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid")] });
    }

    if (filter.findIndex((i) => i.content === word) > -1) {
      const embed = new CustomEmbed(
        message.member,
        "❌ `" + word + "` already exists in the filter",
      )
        .setHeader("chat filter")
        .setFooter({ text: `you can use ${prefix}filter to view the filter` });

      return message.channel.send({ embeds: [embed] });
    }

    if (filter.length + 1 > 250) {
      const embed = new CustomEmbed(
        message.member,
        `❌ filter has exceeded the maximum size - please use *${prefix}filter del/-* or *${prefix}filter reset*`,
      ).setHeader("chat filter");

      return message.channel.send({ embeds: [embed] });
    }

    await addChatFilterWord(message.guildId, word);

    const embed = new CustomEmbed(
      message.member,
      "✅ added `" + word + "` to the filter",
    ).setHeader("chat filter");
    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}filter del/- <word>`)] });
    }

    const word = args.slice(1, args.length).join(" ").toLowerCase().normalize("NFD");

    if (filter.findIndex((i) => i.content === word) > -1) {
      await deleteChatFilterWord(message.guildId, word);
    } else {
      const embed = new CustomEmbed(message.member, "❌ `" + word + "` not found in the filter")
        .setHeader("chat filter")
        .setFooter({ text: `you can use ${prefix}filter to view the filter` });

      return message.channel.send({ embeds: [embed] });
    }

    const embed = new CustomEmbed(message.member, "✅ removed `" + word + "` from the filter")
      .setHeader("chat filter")
      .setFooter({ text: `you can use ${prefix}filter reset to reset the filter` });

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "reset") {
    filter = [];

    for (const word of filter) {
      await deleteChatFilterWord(message.guildId, word.content);
    }

    const embed = new CustomEmbed(message.member, "✅ filter has been reset").setHeader(
      "chat filter",
    );

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "test") {
    const content = args.slice(1, args.length).join(" ").toLowerCase().normalize("NFD");
    const check = await checkMessageContent(message.guild, content, false);
    let embed;
    if (check) {
      embed = new CustomEmbed(message.member).setHeader("chat filter test");
      embed.setDescription(`\`${content}\` was filtered`);
    } else {
      embed = new ErrorEmbed(`\`${content}\` was not found in the filter`);
    }

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
