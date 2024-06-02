import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getSnipeFilter, updateSnipeFilter } from "../utils/functions/guilds/filters";
import { getPrefix } from "../utils/functions/guilds/utils";
import { cleanString } from "../utils/functions/string";

const cmd = new Command("snipefilter", "change the snipe filter for your server", "admin")
  .setAliases(["sf"])
  .setPermissions(["MANAGE_SERVER"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
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

  let filter = await getSnipeFilter(message.guild);

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member, "`" + filter.join("`\n`") + "`")
      .setHeader("current snipe filter")
      .setFooter({ text: `use ${prefix}sf (add/del/+/-) to modify the filter` });

    if (filter.length == 0) {
      embed.setDescription("`❌` empty snipe filter");
    }

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
    if (args.length == 1) {
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            `${prefix}sf add/+ <word> | cAsInG doesn't matter, it'll be filtered either way`,
          ),
        ],
      });
    }

    const word = cleanString(args[1].toString().toLowerCase().normalize("NFD"));

    if (word == "" || word == " ") {
      return message.channel.send({
        embeds: [new ErrorEmbed("word must contain letters or numbers")],
      });
    }

    if (filter.indexOf(word) > -1) {
      const embed = new CustomEmbed(
        message.member,
        "❌ `" + word + "` already exists in the filter",
      )
        .setHeader("snipe filter")
        .setFooter({ text: `you can use ${prefix}sf to view the filter` });

      return message.channel.send({ embeds: [embed] });
    }

    filter.push(word);

    if (filter.join("").length > 1000) {
      filter.splice(filter.indexOf(word), 1);

      const embed = new CustomEmbed(
        message.member,
        `❌ filter has exceeded the maximum size - please use *${prefix}sf del/-* or *${prefix}sf reset*`,
      ).setHeader("snipe filter");

      return message.channel.send({ embeds: [embed] });
    }

    await updateSnipeFilter(message.guild, filter);

    const embed = new CustomEmbed(
      message.member,
      "✅ added `" + word + "` to the filter",
    ).setHeader("snipe filter");
    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}sf del/- <word>`)] });
    }

    const word = cleanString(args[1].toString().toLowerCase().normalize("NFD"));

    if (filter.indexOf(word) > -1) {
      filter.splice(filter.indexOf(word), 1);
    } else {
      const embed = new CustomEmbed(message.member, "❌ `" + word + "` not found in the filter")
        .setHeader("snipe filter")
        .setFooter({ text: `you can use ${prefix}sf to view the filter` });

      return message.channel.send({ embeds: [embed] });
    }

    await updateSnipeFilter(message.guild, filter);

    const embed = new CustomEmbed(message.member, "✅ removed `" + word + "` from the filter")
      .setHeader("snipe filter")
      .setFooter({ text: `you can use ${prefix}sf reset to reset the filter` });

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "reset") {
    filter = ["discordgg", "discordcom"];

    await updateSnipeFilter(message.guild, filter);

    const embed = new CustomEmbed(message.member, "✅ filter has been reset").setHeader(
      "snipe filter",
    );

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
