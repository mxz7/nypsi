import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import {
  getDisabledCommands,
  updateDisabledCommands,
} from "../utils/functions/guilds/disabledcommands";
import { getPrefix } from "../utils/functions/guilds/utils";
import { cleanString } from "../utils/functions/string";
import { commandExists } from "../utils/handlers/commandhandler";

const cmd = new Command("disablecommand", "disable certain commands in your server", "admin")
  .setAliases(["disablecmd", "disable"])
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

  let filter = await getDisabledCommands(message.guild);

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member, "`" + filter.join("`\n`") + "`")
      .setHeader("disabled commands")
      .setFooter({ text: `use ${prefix}disablecmd (add/del/+/-) to modify the list` });

    if (filter.length == 0) {
      embed.setDescription("`❌` no commands disabled");
    }

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
    if (args.length == 1) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`${prefix}disablecmd add/+ <command name>`)],
      });
    }

    const word = cleanString(args[1].toString().toLowerCase().normalize("NFD"));

    if (filter.indexOf(word) > -1) {
      const embed = new CustomEmbed(
        message.member,
        "❌ `" + prefix + word + "` is already disabled",
      ).setFooter({
        text: `you can use ${prefix}disablecmd to view currently disabled commands`,
      });

      return message.channel.send({ embeds: [embed] });
    }

    if (!commandExists(word)) {
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            `you must use the command's name, you can use ${prefix}help <command> to find this`,
          ),
        ],
      });
    }

    if (word == "disablecommand") {
      return message.channel.send({ embeds: [new CustomEmbed(message.member, "nice try")] });
    }

    filter.push(word);

    if (filter.join("").length > 1000) {
      filter.splice(filter.indexOf(word), 1);

      const embed = new CustomEmbed(
        message.member,
        `❌ filter has exceeded the maximum size - please use *${prefix}disablecmd del/-* or *${prefix}disablecmd reset*`,
      ).setHeader("chat filter");

      return message.channel.send({ embeds: [embed] });
    }

    await updateDisabledCommands(message.guild, filter);

    const embed = new CustomEmbed(
      message.member,
      "✅ disabled `" + prefix + word + "` command",
    ).setHeader("disabled commands");
    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
    if (args.length == 1) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`${prefix}disablecmd del/- <command>`)],
      });
    }

    const word = cleanString(args[1].toString().toLowerCase().normalize("NFD"));

    if (filter.indexOf(word) > -1) {
      filter.splice(filter.indexOf(word), 1);
    } else {
      const embed = new CustomEmbed(message.member, "❌ `" + prefix + word + "` is not disabled")
        .setHeader("disabled commands")
        .setFooter({ text: `you can use ${prefix}disablecmd to view currently disabled commands` });

      return message.channel.send({ embeds: [embed] });
    }

    await updateDisabledCommands(message.guild, filter);

    const embed = new CustomEmbed(
      message.member,
      "✅ `" + prefix + word + "` is no longer disabled",
    )
      .setHeader("disable commands")
      .setFooter({ text: `you can use ${prefix}disablecmd reset to reset disabled commands` });

    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "reset") {
    filter = [];

    await updateDisabledCommands(message.guild, filter);

    const embed = new CustomEmbed(message.member, "✅ disabled commands have been reset").setHeader(
      "disabled commands",
    );

    return message.channel.send({ embeds: [embed] });
  } else {
    const embed = new CustomEmbed(message.member, "`" + filter.join("`\n`") + "`")
      .setHeader("disabled commands")
      .setFooter({ text: `use ${prefix}disablecmd (add/del/+/-) to modify the list` });

    if (filter.length == 0) {
      embed.setDescription("`❌` no commands disabled");
    }

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
