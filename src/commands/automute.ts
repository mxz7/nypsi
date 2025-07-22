import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { MStoTime } from "../utils/functions/date";
import { getPrefix } from "../utils/functions/guilds/utils";
import {
  getAutoMuteLevels,
  getAutoMuteTimeout,
  setAutoMuteLevels,
  setAutoMuteTimeout,
} from "../utils/functions/moderation/mute";
import { getDuration } from "../utils/functions/string";

const cmd = new Command("automute", "change auto mute lengths", "admin").setPermissions([
  "MANAGE_SERVER",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({
        embeds: [new ErrorEmbed("you need the `manage server` permission")],
      });
    }
    return;
  }

  const levels = await getAutoMuteLevels(message.guild);

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(
      message.member,
      `${levels
        .map((secs, index) => `${index + 1} \`${MStoTime(secs * 1000, true).trim() || "no mute"}\``)
        .join("\n")}\n\n` +
        `VL expire: \`${MStoTime((await getAutoMuteTimeout(message.guild)) * 1000, true).trim()}\``,
    )
      .setHeader("current auto mute lengths")
      .setFooter({ text: `${prefix}automute <vl | timeout> <length | delete>` });

    if (levels.length == 0) {
      embed.setDescription("automute is disabled");
    }

    return send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "disable") {
    await setAutoMuteLevels(message.guild, []);

    return send({
      embeds: [new CustomEmbed(message.member, "✅ auto mute has been disabled")],
    });
  }

  if (args[0].toLowerCase() === "timeout") {
    if (!args[1].toLowerCase()) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `VL timeout: \`${MStoTime((await getAutoMuteTimeout(message.guild)) * 1000, true).trim()}\`\n\n` +
              `use ${prefix}**automute timeout <length>** to change. eg: ${prefix}automute timeout 1d`,
          ),
        ],
      });
    }

    const duration = getDuration(args[1].toLowerCase());

    if (duration < 3600 || isNaN(duration) || typeof duration !== "number")
      return send({
        embeds: [new ErrorEmbed("invalid duration. format: 15m = 15 minutes")],
      });

    if (duration > 2629746)
      return send({
        embeds: [new ErrorEmbed("invalid duration. format: 15m = 15 minutes")],
      });

    await setAutoMuteTimeout(message.guild, duration);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ updated to ${MStoTime((await getAutoMuteTimeout(message.guild)) * 1000, true).trim()}`,
        ),
      ],
    });
  } else {
    if (args.length == 1 || !parseInt(args[0])) {
      return send({
        embeds: [
          new ErrorEmbed(
            `${prefix}automute <vl> <length | delete>\n${prefix}automute disable\n${prefix}automute <vl> 0 to set a vl to not mute`,
          ),
        ],
      });
    }

    const level = parseInt(args[0]) - 1;

    if (level < 0) {
      return send({ embeds: [new ErrorEmbed("invalid level")] });
    } else if (level > 9) {
      return send({ embeds: [new ErrorEmbed("cannot have more than 10 levels")] });
    } else if (level > levels.length) {
      return send({ embeds: [new ErrorEmbed("cannot skip a vl")] });
    }

    if (args[1].toLowerCase() == "delete") {
      levels.splice(level, 1);

      await setAutoMuteLevels(message.guild, levels);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ level \`${level + 1}\` has been removed`)],
      });
    }

    const duration = getDuration(args[1].toLowerCase());

    if (duration < 0 || isNaN(duration) || typeof duration !== "number")
      return send({
        embeds: [new ErrorEmbed("invalid duration. format: 15m = 15 minutes")],
      });

    levels[level] = duration;

    await setAutoMuteLevels(message.guild, levels);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ set \`${level + 1}\` to \`${MStoTime(duration * 1000, true).trim() || "no mute"}\``,
        ),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
