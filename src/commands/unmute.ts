import {
  BaseMessageOptions,
  CommandInteraction,
  GuildMember,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
  Role,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";

import { getPrefix } from "../utils/functions/guilds/utils";
import { getExactMember } from "../utils/functions/member";
import { newCase } from "../utils/functions/moderation/cases";
import { deleteMute, getMuteRole, isMuted } from "../utils/functions/moderation/mute";
import { createProfile, profileExists } from "../utils/functions/moderation/utils";
import { logger } from "../utils/logger";
import { isAltPunish } from "../utils/functions/guilds/altpunish";
import Constants from "../utils/Constants";
import { getIdFromUsername } from "../utils/functions/users/tag";
import { getAlts, getMainAccount, isAlt } from "../utils/functions/moderation/alts";
import e = require("express");

const cmd = new Command("unmute", "unmute a user", "moderation").setPermissions([
  "MANAGE_MESSAGES",
  "MODERATE_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("user to unmute").setRequired(true),
);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
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

  if (!(await profileExists(message.guild))) await createProfile(message.guild);

  const prefix = await getPrefix(message.guild);

  if (args.length == 0 || !args[0]) {
    return send({ embeds: [new ErrorEmbed(`${prefix}unmute <user> (reason)`)] });
  }

  let target = await getExactMember(message.guild, args[0]);

  const punishAlts = await isAltPunish(message.guild);

  let alts = await getAlts(message.guild, target.user.id).catch(() => []);

  if (!target) return send({ embeds: [new ErrorEmbed("invalid user")] });
  
  if (punishAlts && (await isAlt(message.guild, target.user.id))) {
    target = await getExactMember(
      message.guild,
      await getMainAccount(message.guild, target.user.id),
    );
    alts = await getAlts(message.guild, target.user.id).catch(() => []);
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
        await target.roles
          .remove(muteRole)
          .catch(() => {
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
        await target
          .disableCommunicationUntil(null)
          .catch(() => {
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

  const embed = new CustomEmbed(message.member);

  let msg = `✅ \`${target.user.username}\` has been unmuted`;

  if (alts.length > 0 && punishAlts)
    msg = `✅ \`${target.user.username}\` + ${alts.length} ${
      alts.length != 1 ? "alts have" : "alt has"
    } been unmuted`;

    embed.setDescription(msg);

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

  await doUnmute(message, target, args, mode);
  
  if (!punishAlts) return;

  for (const id of alts) {
    await doUnmute(message, await getExactMember(message.guild, id.altId), args, mode, muteRole, true);
  }
}

async function doUnmute(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  target: GuildMember,
  args: string[],
  mode: string,
  muteRole?: Role,
  isAlt?: boolean,
) {
  let reason = args.length > 1 ? args.slice(1).join(" ") : "no reason given";
  let fail = false;
  if (isAlt) {
    reason += " (alt)"
    try {
      if (mode == "role") {
        if (mode == "role") {
          if (target.roles.cache.has(muteRole.id)) await target.roles.remove(muteRole)
          else fail = true;
      } else if (mode == "timeout") {
          if (target.isCommunicationDisabled()) await target.disableCommunicationUntil(null);
        }
      }
    } catch {
      fail = true;
    }
  }
  if (fail) return;

  await newCase(
    message.guild,
    "unmute",
    target.user.id,
    message.author,
    reason,
  );
}

cmd.setRun(run);

module.exports = cmd;
