import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { isAltPunish } from "../utils/functions/guilds/altpunish";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getAllGroupAccountIds } from "../utils/functions/moderation/alts";
import { newCase } from "../utils/functions/moderation/cases";

import { deleteBan } from "../utils/functions/moderation/ban";
import { getIdFromUsername, getLastKnownUsername } from "../utils/functions/users/tag";

const cmd = new Command("unban", "unban one or more users", "moderation").setPermissions([
  "BAN_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("user").setDescription("username/id of user to unban").setRequired(true),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
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

  if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({ embeds: [new ErrorEmbed("you need the `ban members` permission")] });
    }
    return;
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
    return send({
      embeds: [new ErrorEmbed("i need the `ban members` permission for this command to work")],
    });
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("unban help")
      .addField("usage", `${prefix}unban <id or username> [-s]`)
      .addField(
        "help",
        "**<>** required | **[]** parameter\n" +
          "**<user>** to unban with username, they must have recently used nypsi & be an exact username match\n" +
          "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible",
      )
      .addField(
        "examples",
        `${prefix}unban user1234\n${prefix}unban 123456789012345678\n${prefix}unban 123456789012345678 -s`,
      );

    return send({ embeds: [embed] });
  }

  let target = args[0];

  const punishAlts = await isAltPunish(message.guild);

  if (!target.match(Constants.SNOWFLAKE_REGEX)) {
    target = await getIdFromUsername(target);
  }

  if (!target || !target.match(Constants.SNOWFLAKE_REGEX)) {
    return send({ embeds: [new ErrorEmbed(`couldn't resolve \`${target}\` to a user`)] });
  }

  let fail = false;

  const banned = await message.guild.bans.fetch();

  if (!banned.find((i) => i.user.id === target))
    return send({
      embeds: [
        new ErrorEmbed(
          `\`${(await getLastKnownUsername(target).catch(() => {})) || target}\` is not banned`,
        ),
      ],
    });

  const unbannedUser = await message.guild.members.unban(target, message.content).catch(() => {
    fail = true;
  });

  if (fail || !unbannedUser)
    return send({
      embeds: [
        new ErrorEmbed(
          `failed to unban \`${(await getLastKnownUsername(target).catch(() => {})) || target}\``,
        ),
      ],
    });

  const caseId = await doUnban(message, target, args);

  const embed = new CustomEmbed(message.member);

  if (caseId) embed.setHeader(`unban [${caseId}]`, message.guild.iconURL());

  const ids = await getAllGroupAccountIds(message.guild, target);

  let msg =
    punishAlts && ids.length > 3
      ? `unbanning account and any alts...`
      : `\`${unbannedUser.username}\` has been unbanned`;

  embed.setDescription(msg);

  let res;

  if (ids.length > 3) {
    if (args.join(" ").includes("-s")) {
      if (message instanceof Message) {
        await message.delete();
        res = await message.member.send({ embeds: [embed] }).catch(() => {});
      } else {
        res = await message.reply({ embeds: [embed], ephemeral: true });
      }
    } else {
      res = await send({ embeds: [embed] });
    }
  }

  let altsUnbanned = 0;

  if (!punishAlts) return;

  if (punishAlts) {
    for (const id of ids) {
      if (id == target) continue;
      const unbanned = await doUnban(message, id, args, true);
      if (unbanned) altsUnbanned++;
    }
  }

  if (altsUnbanned > 0)
    msg = `\`${target}\` + ${altsUnbanned} ${
      altsUnbanned != 1 ? "alts have" : "alt has"
    } been unbanned`;
  else msg = `\`${target}\` has been unbanned`;

  embed.setDescription(msg);

  if (ids.length > 3) {
    if (message instanceof Message) {
      await (res as Message).edit({ embeds: [embed] });
    } else {
      await message.editReply({ embeds: [embed] });
    }
  } else {
    if (args.join(" ").includes("-s")) {
      if (message instanceof Message) {
        await message.delete();
        await message.member.send({ embeds: [embed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [embed], ephemeral: true });
      }
    } else {
      await send({ embeds: [embed] });
    }
  }
}

async function doUnban(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  targetId: string,
  args: string[],
  isAlt?: boolean,
) {
  let reason = args.length > 1 ? args.slice(1).join(" ") : "no reason given";
  if (isAlt) {
    reason += " (alt)";
    let fail = false;

    const banned = await message.guild.bans.fetch();

    if (!banned.find((i) => i.user.id === targetId)) return false;

    const unbannedUser = await message.guild.members.unban(targetId, message.content).catch(() => {
      fail = true;
    });

    if (fail || !unbannedUser) return false;
  }

  await deleteBan(message.guild, targetId);
  return await newCase(message.guild, "unban", targetId, message.author, reason);
}

cmd.setRun(run);

module.exports = cmd;
