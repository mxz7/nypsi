import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getChatFilter, updateChatFilter } from "../utils/functions/guilds/filters";
import { getPercentMatch, getPrefix, setPercentMatch } from "../utils/functions/guilds/utils";
import { cleanString } from "../utils/functions/string";

const cmd = new Command("chatfilter", "change the chat filter for your server", "admin")
  .setAliases(["filter"])
  .setPermissions(["MANAGE_SERVER"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
    }
    return;
  }

  let filter = await getChatFilter(message.guild);

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member, "`" + filter.join("`\n`") + "`")
      .setHeader("current chat filter")
      .setFooter({ text: `use ${prefix}filter (add/del/+/-) to modify the filter` });

    if (filter.length == 0) {
      embed.setDescription("`❌` empty chat filter");
    }

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "help") {
    const embed = new CustomEmbed(message.member).setHeader("chat filter help");

    embed.setDescription(
      `${prefix}**filter add/+ <word>** *add a word to the chat filter*\n${prefix}**filter del/- <word>** *remove a word from the chat filter*\n${prefix}**filter reset** *reset the chat filter*\n${prefix}**filter match <percentage>** *percentage match required to delete message*`
    );

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "match" || args[0].toLowerCase() == "percent") {
    if (args.length == 1) {
      const embed = new CustomEmbed(message.member).setHeader("chat filter percentage match");

      const current = await getPercentMatch(message.guild);

      embed.setDescription(
        `current: \`${current}%\` match required\nuse ${prefix}**filter match <percent>** to change this.\n\n` +
          "the percentage match setting allows nypsi to calculate a percentage difference from words in a user's message and with words in the filter, if a word has a high enough match rate, that can be deleted. set this to 100 for exact matches only"
      );

      return message.channel.send({ embeds: [embed] });
    }

    if (!parseInt(args[1])) {
      return message.channel.send({ embeds: [new ErrorEmbed("must be a number idiot")] });
    }

    const amount = parseInt(args[1]);

    if (amount < 0 || amount > 100) {
      return message.channel.send({ embeds: [new ErrorEmbed("ur pretty stupid arent u. **PERCENTAGE** MATCH")] });
    }

    await setPercentMatch(message.guild, amount);

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `✅ percentage match has been set to \`${amount}%\``)],
    });
  }

  if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
    if (args.length == 1) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`${prefix}filter add/+ <word> | cAsInG doesn't matter, it'll be filtered either way`)],
      });
    }

    const word = cleanString(args[1].toString().toLowerCase().normalize("NFD"));

    if (word == "" || word == " ") {
      return message.channel.send({ embeds: [new ErrorEmbed("word must contain letters or numbers")] });
    }

    if (filter.indexOf(word) > -1) {
      const embed = new CustomEmbed(message.member, "❌ `" + word + "` already exists in the filter")
        .setHeader("chat filter")
        .setFooter({ text: `you can use ${prefix}filter to view the filter` });

      return message.channel.send({ embeds: [embed] });
    }

    filter.push(word);

    if (filter.join("").length > 1000) {
      filter.splice(filter.indexOf(word), 1);

      const embed = new CustomEmbed(
        message.member,
        `❌ filter has exceeded the maximum size - please use *${prefix}filter del/-* or *${prefix}filter reset*`
      ).setHeader("chat filter");

      return message.channel.send({ embeds: [embed] });
    }

    await updateChatFilter(message.guild, filter);

    const embed = new CustomEmbed(message.member, "✅ added `" + word + "` to the filter").setHeader("chat filter");
    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}filter del/- <word>`)] });
    }

    const word = cleanString(args[1].toString().toLowerCase().normalize("NFD"));

    if (filter.indexOf(word) > -1) {
      filter.splice(filter.indexOf(word), 1);
    } else {
      const embed = new CustomEmbed(message.member, "❌ `" + word + "` not found in the filter")
        .setHeader("chat filter")
        .setFooter({ text: `you can use ${prefix}filter to view the filter` });

      return message.channel.send({ embeds: [embed] });
    }

    await updateChatFilter(message.guild, filter);

    const embed = new CustomEmbed(message.member, "✅ removed `" + word + "` from the filter")
      .setHeader("chat filter")
      .setFooter({ text: `you can use ${prefix}filter reset to reset the filter` });

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "reset") {
    filter = [];

    await updateChatFilter(message.guild, filter);

    const embed = new CustomEmbed(message.member, "✅ filter has been reset").setHeader("chat filter");

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
