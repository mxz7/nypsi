import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getExactMember } from "../utils/functions/member";
import { getCases } from "../utils/functions/moderation/cases";
import PageManager from "../utils/functions/page";

import prisma from "../init/database";
import Constants from "../utils/Constants";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("history", "view punishment history for a given user", "moderation")
  .setAliases(["modlogs", "hist"])
  .setPermissions(["MANAGE_MESSAGES", "MODERATE_MEMBERS"]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((user) =>
    user.setName("user").setDescription("use the user's id or username").setRequired(true),
  )
  .addStringOption((filter) =>
    filter
      .setName("filter")
      .setDescription("filter by action")
      .setChoices(
        { name: "warn", value: "warn" },
        { name: "mute", value: "mute" },
        { name: "unmute", value: "unmute" },
        { name: "kick", value: "kick" },
        { name: "ban", value: "ban" },
        { name: "unban", value: "unban" },
      ),
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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("history help")
      .addField("usage", `${prefix}history @user\n${prefix}history <user ID or tag>`);

    return send({ embeds: [embed] });
  }

  let filter = "";

  if (args.length > 1) {
    if (
      ["warn", "mute", "unmute", "kick", "ban", "unban"].includes(
        args[args.length - 1].toLowerCase(),
      )
    ) {
      filter = args[args.length - 1].toLowerCase();
    }
  }

  let member: GuildMember | string = await getExactMember(
    message.guild,
    (filter ? args.slice(0, -1) : args).join(" "),
  );

  if (!member) {
    if (args[0].match(Constants.SNOWFLAKE_REGEX)) {
      member = args[0];
    } else {
      const user = await prisma.user.findFirst({
        where: {
          lastKnownUsername: args[0].toLowerCase(),
        },
        select: {
          id: true,
        },
      });

      if (user?.id) member = user.id;
      else return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  const cases = (await getCases(message.guild, member)).filter((i) =>
    filter ? i.type == filter : true,
  );

  if (cases.length == 0) {
    return send({ embeds: [new ErrorEmbed("no history to display")] });
  }

  await addCooldown(cmd.name, message.member, 5);

  const pages = new Map<number, typeof cases>();

  for (const c of cases) {
    if (pages.size == 0) {
      pages.set(1, [c]);
    } else if (pages.get(pages.size).length >= 5) {
      pages.set(pages.size + 1, [c]);
    } else {
      const arr = pages.get(pages.size);
      arr.push(c);
    }
  }

  const embed = new CustomEmbed(message.member).setFooter({
    text: `page 1/${pages.size} | total: ${cases.length.toLocaleString()}`,
  });

  if (!(member instanceof GuildMember)) {
    embed.setHeader(`history for ${member}${filter ? ` (${filter})` : ""}`);
  } else {
    embed.setHeader(`history for ${member.user.username}${filter ? ` (${filter})` : ""}`);
  }

  const updatePage = (page: typeof cases, embed: CustomEmbed) => {
    if (embed.data.fields?.length) embed.data.fields.length = 0;

    for (const item of page) {
      if (item.deleted) {
        embed.addField(
          item.caseId.toString(),
          `${item.evidence?.id ? `[\`[deleted]\`](https://cdn.nypsi.xyz/evidence/${item.guildId}/${item.evidence.id})` : "`[deleted]`"}`,
        );
      } else {
        embed.addField(
          `case ${item.caseId}`,
          (item.evidence?.id
            ? `[\`${item.type}\`](https://cdn.nypsi.xyz/evidence/${item.guildId}/${item.evidence.id})`
            : `\`${item.type}\``) +
            " - " +
            item.command +
            "\non " +
            `<t:${Math.floor(item.time.getTime() / 1000)}:d>`,
        );
      }
    }

    return embed;
  };

  updatePage(pages.get(1), embed);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  let msg: Message;

  if (pages.size == 1) {
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  const manager = new PageManager({
    pages,
    message: msg,
    embed,
    row,
    userId: message.author.id,
    onPageUpdate(manager) {
      manager.embed.setFooter({
        text: `page ${manager.currentPage}/${manager.lastPage} | total: ${cases.length.toLocaleString()}`,
      });
      return manager.embed;
    },
    updateEmbed: updatePage,
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
