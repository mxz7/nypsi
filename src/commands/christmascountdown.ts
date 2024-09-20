import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { daysUntilChristmas } from "../utils/functions/date";
import {
  checkChristmasCountdown,
  createNewChristmasCountdown,
  getChristmasCountdown,
  hasChristmasCountdown,
  setChristmasCountdown,
} from "../utils/functions/guilds/christmas";
import { getPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("christmascountdown", "create a christmas countdown", "admin")
  .setAliases(["christmas", "xmas"])
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
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `${daysUntilChristmas()} days until christmas`)],
    });
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.channel.send({
      embeds: [new ErrorEmbed("i need the `manage channels` permission for this command to work")],
    });
  }

  if (!(await hasChristmasCountdown(message.guild)))
    await createNewChristmasCountdown(message.guild);

  let profile = await getChristmasCountdown(message.guild);
  const prefix = (await getPrefix(message.guild))[0];

  const help = () => {
    const embed = new CustomEmbed(
      message.member,
      `${prefix}**xmas enable <channel>** *enables the christmas countdown in the given channel*\n` +
        `${prefix}**xmas disable** *disables the christmas countdown*\n` +
        `${prefix}**xmas channel <channel>** *change the channel used*\n` +
        `${prefix}**xmas format <new format>** *change the format for the countdown*`,
    ).setHeader("christmas countdown");
    return message.channel.send({ embeds: [embed] });
  };

  if (args.length == 0) {
    const embed = new CustomEmbed(
      message.member,
      `**enabled** \`${profile.enabled}\`\n` +
        `**format** ${profile.format}\n**channel** \`${profile.channel}\``,
    )
      .setHeader("christmas countdown")
      .setFooter({ text: `use ${prefix}xmas help to view additional commands` });

    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "enable") {
    if (profile.enabled) {
      return message.channel.send({ embeds: [new ErrorEmbed("already enabled")] });
    }

    let channel;

    if (args.length == 1) {
      channel = await message.guild.channels.create({
        name: "christmas",
      });
    } else {
      if (!(await message.guild.channels.cache.get(channel))) {
        if (message.mentions.channels.first()) {
          channel = message.mentions.channels.first();
        } else {
          return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        }
      } else if (message.mentions.channels.first()) {
        channel = message.mentions.channels.first();
      } else {
        const c = message.guild.channels.cache.find((c) => c.id == args[1]);

        if (!c) {
          return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
        } else {
          channel = c;
        }
      }
    }

    if (!channel) {
      return message.channel.send({ embeds: [new ErrorEmbed("error creating/getting channel")] });
    }

    profile.enabled = true;
    profile.channel = channel.id;

    await setChristmasCountdown(message.guild, profile);

    await checkChristmasCountdown(message.guild);

    profile = await getChristmasCountdown(message.guild);

    if (!profile.enabled) {
      return message.channel.send({
        embeds: [new ErrorEmbed("error sending message: check permissions for nypsi")],
      });
    }

    return await message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ christmas countdown enabled")],
    });
  } else if (args[0].toLowerCase() == "disable") {
    if (!profile.enabled) {
      return message.channel.send({ embeds: [new ErrorEmbed("already disabled")] });
    }

    profile.enabled = false;
    profile.channel = "none";

    await setChristmasCountdown(message.guild, profile);

    return await message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ christmas countdown disabled")],
    });
  } else if (args[0].toLowerCase() == "format") {
    if (args.length == 1) {
      const format = profile.format.split("%days%").join(daysUntilChristmas().toString());

      const embed = new CustomEmbed(
        message.member,
        "this is how the message will appear\n%days% will be replaced with how many days are left until christmas",
      )
        .setHeader("christmas countdown")
        .addField("current format", `\`${profile.format}\``, true)
        .addField("example", format, true)
        .addField("help", `to change this format, do ${prefix}**xmas format <new format>**`);

      return message.channel.send({ embeds: [embed] });
    }

    args.shift();

    const newFormat = args.join(" ");

    if (!newFormat.includes("%days%")) {
      return message.channel.send({ embeds: [new ErrorEmbed("format must include %days%")] });
    }

    if (newFormat.length > 250) {
      return message.channel.send({
        embeds: [new ErrorEmbed("cannot be longer than 250 characters")],
      });
    }

    profile.format = newFormat;

    await setChristmasCountdown(message.guild, profile);

    await checkChristmasCountdown(message.guild);

    profile = await getChristmasCountdown(message.guild);

    await setChristmasCountdown(message.guild, profile);

    if (profile.enabled) {
      await checkChristmasCountdown(message.guild);

      profile = await getChristmasCountdown(message.guild);

      if (!profile.enabled) {
        return message.channel.send({
          embeds: [new ErrorEmbed("error sending message: check permissions for nypsi")],
        });
      }
    }

    const embed = new CustomEmbed(message.member, "✅ format updated").setHeader(
      "christmas countdown",
    );

    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "channel") {
    if (args.length == 1) {
      const embed = new CustomEmbed(
        message.member,
        "by setting the channel it will change the channel that the message is sent in",
      )
        .setHeader("christmas countdown")
        .addField("current value", "`" + profile.channel + "`")
        .addField("help", `to change this value, do ${prefix}**xmas channel <channel id>**`);

      return message.channel.send({ embeds: [embed] });
    }

    let channel;

    if (!message.guild.channels.cache.get(channel)) {
      if (message.mentions.channels.first()) {
        channel = message.mentions.channels.first();
      } else {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
      }
    } else {
      const c = message.guild.channels.cache.find((c) => c.id == args[1]);

      if (!c) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
      } else {
        channel = c;
      }
    }

    if (profile.channel == channel.id) {
      return message.channel.send({
        embeds: [new ErrorEmbed("channel must be different to current channel")],
      });
    }

    profile.channel = channel.id;

    await setChristmasCountdown(message.guild, profile);

    if (profile.enabled) {
      await checkChristmasCountdown(message.guild);

      profile = await getChristmasCountdown(message.guild);

      if (!profile.enabled) {
        return message.channel.send({
          embeds: [new ErrorEmbed("error sending message: check permissions for nypsi")],
        });
      }
    }

    const embed = new CustomEmbed(message.member, "✅ channel updated").setHeader(
      "christmas countdown",
    );

    return message.channel.send({ embeds: [embed] });
  } else {
    return help();
  }
}

cmd.setRun(run);

module.exports = cmd;
