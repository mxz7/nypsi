import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import { newCase } from "../utils/functions/moderation/cases";
import { createProfile, profileExists } from "../utils/functions/moderation/utils";
import { getIdFromUsername, getLastKnownUsername } from "../utils/functions/users/tag";

const cmd = new Command("unban", "unban one or more users", "moderation").setPermissions([
  "BAN_MEMBERS",
]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("user").setDescription("username/id of user to unban").setRequired(true),
);

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

  if (!(await profileExists(message.guild))) await createProfile(message.guild);

  const prefix = await getPrefix(message.guild);

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
          `\`${(await getLastKnownUsername(target).catch(() => null)) || target}\` is not banned`,
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
          `failed to unban \`${(await getLastKnownUsername(target).catch(() => null)) || target}\``,
        ),
      ],
    });

  const embed = new CustomEmbed(
    message.member,
    `✅ \`${unbannedUser.username}\` has been unbanned`,
  );

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

  await newCase(
    message.guild,
    "unban",
    unbannedUser.id,
    message.author,
    args.length > 1 ? args.slice(1).join(" ") : "no reason given",
  );
}

cmd.setRun(run);

module.exports = cmd;
