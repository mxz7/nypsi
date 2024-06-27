import {
  BaseMessageOptions,
  Channel,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "lockdown",
  "lockdown a channel (will only work if permissions are setup correctly)",
  "moderation",
)
  .setAliases(["lock", "shutup"])
  .setPermissions(["MANAGE_MESSAGES", "MANAGE_CHANNELS"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (
    !message.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    !message.member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({
        embeds: [new ErrorEmbed("you need the `manage channels` and `manage messages` permission")],
      });
    }
    return;
  }

  if (
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels) ||
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)
  ) {
    return send({
      embeds: [
        new ErrorEmbed(
          "i need the `manage channels` and `manage roles` permission for this command to work",
        ),
      ],
    });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  let channel: Channel = message.channel;

  if (args.length != 0) {
    const id = args[0];

    channel = message.guild.channels.cache.find((ch) => ch.id == id);

    if (!channel) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    } else if (message instanceof Message && message.mentions.channels.first()) {
      channel = message.mentions.channels.first();
    }

    if (!channel.isTextBased()) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    }
  }

  if (!channel.isTextBased()) return;

  if (channel.isDMBased()) return;

  if (channel.isThread()) return send({ embeds: [new ErrorEmbed("invalid channel")] });

  await addCooldown(cmd.name, message.member, 3);

  let locked = false;

  const role = message.guild.roles.cache.find((role) => role.name == "@everyone");

  const a = channel.permissionOverwrites.cache.get(role.id);

  if (!a) {
    locked = false;
  } else if (!a.deny) {
    locked = false;
  } else if (!a.deny.bitfield) {
    locked = false;
  } else {
    const b = new PermissionsBitField(a.deny.bitfield).toArray();
    if (b.includes("SendMessages")) {
      locked = true;
    }
  }

  if (!locked) {
    await channel.permissionOverwrites.edit(role, {
      SendMessages: false,
    });

    const embed = new CustomEmbed(message.member, "✅ " + channel.toString() + " has been locked");

    return send({ embeds: [embed] }).catch(() => {
      return message.member.send({ embeds: [embed] }).catch(() => {});
    });
  } else {
    await channel.permissionOverwrites.edit(role, {
      SendMessages: null,
    });
    const embed = new CustomEmbed(
      message.member,
      "✅ " + channel.toString() + " has been unlocked",
    );

    return send({ embeds: [embed] }).catch(() => {
      return message.member.send({ embeds: [embed] });
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
