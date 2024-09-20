import { Channel, CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("nsfw", "toggle nsfw on a channel", "admin").setPermissions([
  "MANAGE_CHANNELS",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.channel.send({
        embeds: [new ErrorEmbed("you need the `manage channels` permission")],
      });
    }
    return;
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return message.channel.send({
      embeds: [new ErrorEmbed("i need the `manage channel` permission for this command to work")],
    });
  }

  let channel: Channel;

  if (args.length == 0) {
    channel = message.channel;
  } else if (message.mentions.channels.first()) {
    channel = message.mentions.channels.first();
  } else {
    channel = message.guild.channels.cache.find((ch) => ch.name.includes(args[0]));

    if (!channel) {
      return message.channel.send({ embeds: [new ErrorEmbed("couldn't find that channel")] });
    }
  }

  if (!channel) {
    return message.channel.send({ embeds: [new ErrorEmbed("couldn't find that channel")] });
  }

  if (!channel.isTextBased()) {
    return message.channel.send({ embeds: [new ErrorEmbed("this is not a text channel")] });
  }

  if (channel.isDMBased()) return;

  if (channel.isThread()) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
  }

  if (!channel.nsfw) {
    let fail = false;
    await channel.setNSFW(true).catch(() => {
      fail = true;
    });

    if (fail) {
      return message.channel.send({ embeds: [new ErrorEmbed("unable to edit that channel")] });
    }

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `✅ ${channel.toString()} is now nsfw`)],
    });
  } else {
    let fail = false;
    await channel.setNSFW(false).catch(() => {
      fail = true;
    });

    if (fail) {
      return message.channel.send({ embeds: [new ErrorEmbed("unable to edit that channel")] });
    }

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `✅ ${channel.toString()} is no longer nsfw`)],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
