import { CommandInteraction, GuildBasedChannel, PermissionFlagsBits, Role } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMuteRole, setMuteRole } from "../utils/functions/moderation/mute";

const cmd = new Command("muterole", "set the muterole for the server", "admin")
  .setPermissions(["MANAGE_SERVER"])
  .setDocs("https://nypsi.xyz/docs/moderation/muterole");

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

  const prefix = (await getPrefix(message.guild))[0];

  const help = async () => {
    const current = await getMuteRole(message.guild);

    let role;

    if (current != "" && current != "timeout" && current) {
      role = await message.guild.roles.cache.get(current);

      if (!role) {
        await setMuteRole(message.guild, "");
        role = undefined;
      }
    }

    let text = `${prefix}**muterole set <role>** *set the muterole for the server*\n${prefix}**muterole reset** *reset the mute role to default*\n${prefix}**muterole update** update mute permissions for every channel\n${prefix}**muterole timeout** use timeout mode instead of a role\n\n`;

    if (current == "timeout") {
      text += `currently using **timeout mode**, to use a role instead, use the ${prefix}**muterole reset** command`;
    } else {
      text += `current mute role: ${role ? role.toString() : "default"}`;
    }

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, text).setHeader("mute role")],
    });
  };

  if (args.length == 0) {
    return help();
  }

  if (args[0].toLowerCase() == "set") {
    if (args.length == 1) {
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            `${prefix}**muterole set <role>**\n\nyou can mention the role, use the role's ID or name`,
          ),
        ],
      });
    }

    const roles = message.guild.roles.cache;

    let role;

    if (message.mentions.roles.first()) {
      role = message.mentions.roles.first();
    } else if (message.guild.roles.cache.get(args[1])) {
      role = roles.find((r) => r.id == args[1]);
    } else {
      args.shift();
      role = roles.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()));
    }

    if (!role) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`couldn't find the role \`${args.join(" ")}\``)],
      });
    }

    await setMuteRole(message.guild, role);

    return message.channel.send({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ muterole has been updated to ${role.toString()}\n\nnote: any currently muted users will be automatically unmuted. check these users with (${prefix}**muted**)`,
        ),
      ],
    });
  } else if (args[0].toLowerCase() == "reset") {
    await setMuteRole(message.guild, "default");

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ muterole has been reset")],
    });
  } else if (args[0].toLowerCase() == "update") {
    let muteRole: Role | void;

    const guildMuteRole = await getMuteRole(message.guild);

    if (!guildMuteRole || guildMuteRole == "default")
      muteRole = message.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
    else muteRole = await message.guild.roles.fetch(guildMuteRole).catch(() => {});

    if (!muteRole) {
      try {
        muteRole = await message.guild.roles.create({
          name: "muted",
        });
      } catch {
        return message.channel.send({
          embeds: [new ErrorEmbed("error creating new mute role, please check my permissions")],
        });
      }
    }

    if (!muteRole) {
      return message.channel.send({
        embeds: [new ErrorEmbed("error creating new mute role, please check my permissions")],
      });
    }

    let failedChannels: GuildBasedChannel[] = [];

    for (const channel of message.guild.channels.cache.values()) {
      if (channel.isThread()) continue;
      await channel.permissionOverwrites
        .edit(muteRole, {
          SendMessages: false,
          Speak: false,
          AddReactions: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
        })
        .catch(() => failedChannels.push(channel));
    }

    if (failedChannels.length > 0) {
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            `couldn't update the following channels: ${failedChannels.map((c) => c.toString()).join(", ")}`,
          ),
        ],
      });
    }

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, `✅ permissions updated for all channels`)],
    });
  } else if (args[0].toLowerCase() == "timeout") {
    await setMuteRole(message.guild, "timeout");

    const embed = new CustomEmbed(
      message.member,
      `✅ now using **timeout** mode\n\nnote: any currently muted users will be automatically unmuted. check these users with (${prefix}**muted**)`,
    );

    return message.channel.send({
      embeds: [embed],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
