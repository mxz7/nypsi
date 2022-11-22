import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { MStoTime } from "../utils/functions/date";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getAutoMuteLevels, setAutoMuteLevels } from "../utils/functions/moderation/mute";

const cmd = new Command("automute", "change auto mute lengths", Categories.ADMIN).setPermissions(["MANAGE_SERVER"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
    }
    return;
  }

  const levels = await getAutoMuteLevels(message.guild);

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(
      message.member,
      levels.map((secs, index) => `${index + 1} \`${MStoTime(secs * 1000, true).trim() || "no mute"}\``).join("\n")
    )
      .setHeader("current auto mute lengths")
      .setFooter({ text: `${prefix}automute <vl> <length | none>` });

    if (levels.length == 0) {
      embed.setDescription("automute is disabled");
    }

    return message.channel.send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "disable") {
    await setAutoMuteLevels(message.guild, []);

    return message.channel.send({ embeds: [new CustomEmbed(message.member, "✅ auto mute has been disabled")] });
  }

  if (!parseInt(args[0])) {
    return message.channel.send({
      embeds: [new ErrorEmbed(`${prefix}automute <vl> <length | none>\n${prefix}automute disable`)],
    });
  }

  const level = parseInt(args[0]) - 1;

  if (level < 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid level")] });
  } else if (level > 9) {
    return message.channel.send({ embeds: [new ErrorEmbed("cannot have more than 10 levels")] });
  }

  if (args[1].toLowerCase() == "none") {
    levels.splice(level, 1);

    await setAutoMuteLevels(message.guild, levels);

    return message.channel.send({ embeds: [new CustomEmbed(message.member, `✅ level \`${level + 1}\` has been removed`)] });
  }

  const duration = getDuration(args[1].toLowerCase());

  if (!duration && duration !== 0)
    return message.channel.send({ embeds: [new ErrorEmbed("invalid duration. format: 15m = 15 minutes")] });

  levels[level] = duration;

  await setAutoMuteLevels(message.guild, levels);

  return message.channel.send({
    embeds: [new CustomEmbed(message.member, `✅ set \`${level + 1}\` to \`${duration.toLocaleString()}\` seconds`)],
  });
}

cmd.setRun(run);

module.exports = cmd;

function getDuration(duration: string): number {
  duration.toLowerCase();

  if (duration.includes("d")) {
    if (!parseInt(duration.split("d")[0])) return undefined;

    const num = parseInt(duration.split("d")[0]);

    return num * 86400;
  } else if (duration.includes("h")) {
    if (!parseInt(duration.split("h")[0])) return undefined;

    const num = parseInt(duration.split("h")[0]);

    return num * 3600;
  } else if (duration.includes("m")) {
    if (!parseInt(duration.split("m")[0])) return undefined;

    const num = parseInt(duration.split("m")[0]);

    return num * 60;
  } else if (duration.includes("s")) {
    if (!parseInt(duration.split("s")[0])) return undefined;

    const num = parseInt(duration.split("s")[0]);

    return num;
  }
}
