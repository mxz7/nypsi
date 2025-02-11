import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
  Role,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { isAltPunish } from "../utils/functions/guilds/altpunish";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getExactMember } from "../utils/functions/member";
import { getAllGroupAccountIds } from "../utils/functions/moderation/alts";
import { newCase } from "../utils/functions/moderation/cases";
import { deleteMute, getMuteRole, isMuted } from "../utils/functions/moderation/mute";

const cmd = new Command("unmute", "unmute a user", "moderation").setPermissions([
  "MANAGE_MESSAGES",
  "MODERATE_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("user to unmute").setRequired(true),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

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

  if (
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return send({
      embeds: [
        new ErrorEmbed(
          "i need the `manage roles` and `manage channels` permission for this command to work",
        ),
      ],
    });
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0 || !args[0]) {
    return send({ embeds: [new ErrorEmbed(`${prefix}unmute <user> (reason)`)] });
  }

  const target = await getExactMember(message.guild, args[0]);

  const punishAlts = await isAltPunish(message.guild);

  if (!target) {
    if (await isMuted(message.guild, args[0])) {
      const accounts: string[] = [];

      if (punishAlts) accounts.push(...(await getAllGroupAccountIds(message.guild, args[0])));
      else accounts.push(args[0]);

      for (const account of accounts) {
        await deleteMute(message.guild, account);
      }

      return send({
        embeds: [
          new CustomEmbed(message.member).setDescription(
            `**${accounts[0]}**${accounts.length > 1 ? ` (+ ${accounts.length - 1} alts)` : ""} has been unmuted`,
          ),
        ],
      });
    }

    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const guildMuteRole = await getMuteRole(message.guild);

  let muteRole: Role;
  let mode = "role";

  if (!guildMuteRole || guildMuteRole == "default") {
    muteRole = message.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");

    if (!muteRole) {
      return send({ embeds: [new ErrorEmbed("failed to find role called `muted`")] });
    }
  } else if (guildMuteRole == "timeout") {
    mode = "timeout";
  } else {
    muteRole = await message.guild.roles.cache.get(guildMuteRole);

    if (!muteRole) {
      return send({ embeds: [new ErrorEmbed(`failed to find muterole: ${guildMuteRole}`)] });
    }
  }

  let fail = false;

  if (mode == "role") {
    if (target.roles.cache.has(muteRole.id)) {
      await target.roles.remove(muteRole).catch(() => {
        fail = true;
        return send({
          embeds: [
            new ErrorEmbed(
              "there was an error when removing the role, please ensure i have the correct permissions",
            ),
          ],
        });
      });
    } else {
      fail = true;
      return send({
        embeds: [
          new ErrorEmbed(
            `**${target.user.username}** does not have the muted role (${muteRole.toString()})`,
          ),
        ],
      });
    }
  } else if (mode == "timeout") {
    if (target.isCommunicationDisabled()) {
      await target.disableCommunicationUntil(null).catch(() => {
        fail = true;
        return send({
          embeds: [
            new ErrorEmbed(
              "there was an error when unmuting the user, please ensure i have the correct permissions",
            ),
          ],
        });
      });
    }
  }

  if (fail) return;

  const caseId = await doUnmute(message, target, args, mode);

  const embed = new CustomEmbed(message.member);

  if (caseId) embed.setHeader(`ummute [${caseId}]`, message.guild.iconURL());

  const ids = await getAllGroupAccountIds(message.guild, target.user.id);

  let msg =
    punishAlts && ids.length > 3
      ? `unmuting account and any alts...`
      : `\`${target.user.username}\` has been unmuted`;

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

  let altsUnmted = 0;

  if (punishAlts) {
    for (const id of ids) {
      if (id == target.user.id) continue;
      const unmuted = await doUnmute(
        message,
        await getExactMember(message.guild, id),
        args,
        mode,
        muteRole,
        true,
      );
      if (unmuted) altsUnmted++;
    }
  }

  if (altsUnmted > 0)
    msg = `\`${target.user.username}\` + ${altsUnmted} ${
      altsUnmted != 1 ? "alts have" : "alt has"
    } been unmuted`;
  else msg = `\`${target.user.username}\` has been unmuted`;

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

async function doUnmute(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  target: GuildMember,
  args: string[],
  mode: string,
  muteRole?: Role,
  isAlt?: boolean,
) {
  let reason = args.length > 1 ? args.slice(1).join(" ") : "no reason given";
  let fail = false;
  if (isAlt) {
    reason += " (alt)";
    try {
      if (mode == "role") {
        if (mode == "role") {
          if (target.roles.cache.has(muteRole.id)) await target.roles.remove(muteRole);
          else fail = true;
        } else if (mode == "timeout") {
          if (target.isCommunicationDisabled()) await target.disableCommunicationUntil(null);
        }
      }
    } catch {
      fail = true;
    }
  }
  if (fail) return false;

  await deleteMute(message.guild, target.user.id);
  return await newCase(message.guild, "unmute", target.user.id, message.author, reason);
}

cmd.setRun(run);

module.exports = cmd;
