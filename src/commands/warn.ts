import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getExactMember } from "../utils/functions/member";
import { newCase } from "../utils/functions/moderation/cases";

const cmd = new Command("warn", "warn one or more users", "moderation").setPermissions([
  "MANAGE_MESSAGES",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) =>
    option.setName("user").setDescription("user to warn").setRequired(true),
  )
  .addStringOption((option) => option.setName("reason").setDescription("reason for the warn"));

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const prefix = (await getPrefix(message.guild))[0];

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

  if (args.length == 0 || !args[0]) {
    const embed = new CustomEmbed(message.member)
      .setHeader("warn help")
      .addField("usage", `${prefix}warn <user> (reason) [-s`)
      .addField(
        "help",
        "**<>** required | **()** optional | **[]** parameter\n" +
          "**<user>** can tag them or use their username\n" +
          "**(reason)** reason for the warn, will be given to all warned members\n" +
          "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible\n\n" +
          "if the bot was unable to DM a user on warn, the warning will still be logged",
      )
      .addField(
        "examples",
        `${prefix}warn @member toxicity\n${prefix}warn @member @member2 toxicity`,
      );

    return send({ embeds: [embed] });
  }

  const target = await getExactMember(message.guild, args[0]);

  if (!target) return send({ embeds: [new ErrorEmbed("invalid user")] });

  let reason;

  if (args.length > 1) {
    reason = args.slice(1).join(" ");
  } else {
    return send({ embeds: [new ErrorEmbed("you must include a warn reason")] });
  }

  if (target.user.id == message.client.user.id) {
    await send({ content: "wow... 😢" });
    return;
  }

  const targetHighestRole = target.roles.highest;
  const memberHighestRole = message.member.roles.highest;

  let dmFail = false;

  if (
    targetHighestRole.position >= memberHighestRole.position &&
    message.guild.ownerId != message.author.id
  ) {
    return send({
      embeds: [new ErrorEmbed(`your role is not high enough to punish ${target.toString()}`)],
    });
  } else {
    const embed = new CustomEmbed(target)
      .setTitle(`warned in ${message.guild.name}`)
      .addField("reason", `\`${reason}\``);

    await target
      .send({ content: `you have been warned in ${message.guild.name}`, embeds: [embed] })
      .catch(() => {
        dmFail = true;
      });
  }

  const caseId = await newCase(message.guild, "warn", target.user.id, message.author, reason);

  const embed = new CustomEmbed(
    message.member,
    `\`${target.user.username}\` has been warned for **${reason}**`,
  );

  if (caseId) embed.setHeader(`warn [${caseId}]`, message.guild.iconURL());

  if (dmFail) {
    embed.setDescription(
      `⚠️ failed to send message to \`${target.user.username}\`. warn has still been logged`,
    );
  }

  if (args.join(" ").includes("-s")) {
    if (message instanceof Message) {
      await message.delete();
      await message.member.send({ embeds: [embed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  } else {
    await send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
