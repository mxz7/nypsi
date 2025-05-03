import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getExactMember } from "../utils/functions/member";
import { getCases } from "../utils/functions/moderation/cases";

import prisma from "../init/database";
import Constants from "../utils/Constants";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("history", "view punishment history for a given user", "moderation")
  .setAliases(["modlogs", "hist"])
  .setPermissions(["MANAGE_MESSAGES", "MODERATE_MEMBERS"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("user").setDescription("use the user's id or username").setRequired(true),
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

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("history help")
      .addField("usage", `${prefix}history @user\n${prefix}history <user ID or tag>`);

    return send({ embeds: [embed] });
  }

  let member: GuildMember | string = await getExactMember(message.guild, args.join(" "));

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

  const cases = await getCases(
    message.guild,
    member instanceof GuildMember ? member.user.id : member,
  );
  const pages: (typeof cases)[] = [];

  if (cases.length == 0) {
    return send({ embeds: [new ErrorEmbed("no history to display")] });
  }

  await addCooldown(cmd.name, message.member, 5);

  let count = 0;
  let page: typeof cases = [];
  for (const case0 of cases) {
    if (count == 5) {
      pages.push(page);
      page = [];
      page.push(case0);
      count = 1;
    } else {
      page.push(case0);
      count++;
    }
  }

  if (count != 0) {
    pages.push(page);
  }

  const embed = new CustomEmbed(message.member).setFooter({
    text: "page 1/" + pages.length + " | total: " + cases.length,
  });

  if (!(member instanceof GuildMember)) {
    embed.setHeader("history for " + member);
  } else {
    embed.setHeader("history for " + member.user.username);
  }

  for (const case0 of pages[0]) {
    if (case0.deleted) {
      embed.addField(
        case0.caseId.toString(),
        `${case0.evidence?.id ? `[\`[deleted]\`](https://cdn.nypsi.xyz/evidence/${case0.guildId}/${case0.evidence.id})` : "`[deleted`]"}`,
      );
    } else {
      embed.addField(
        case0.caseId.toString(),
        (case0.evidence?.id
          ? `[\`${case0.type}\`](https://cdn.nypsi.xyz/evidence/${case0.guildId}/${case0.evidence.id})`
          : `\`${case0.type}\``) +
          " - " +
          case0.command +
          "\non " +
          `<t:${Math.floor(case0.time.getTime() / 1000)}:d>`,
      );
    }
  }

  let msg: Message;

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  if (pages.length >= 2) {
    msg = await send({ embeds: [embed], components: [row] });
  } else {
    return await send({ embeds: [embed] });
  }

  if (pages.length > 1) {
    let currentPage = 0;

    const lastPage = pages.length;

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const edit = async (data: MessageEditOptions, msg?: Message) => {
      if (!(message instanceof Message)) {
        await message.editReply(data as InteractionEditReplyOptions);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    const pageManager = async (): Promise<void> => {
      const reaction = await msg
        .awaitMessageComponent({ filter, time: 30000 })
        .then(async (collected) => {
          await collected.deferUpdate();
          return collected.customId;
        })
        .catch(async () => {
          await edit({ components: [] }).catch(() => {});
        });

      const newEmbed = new CustomEmbed(message.member);

      if (!(member instanceof GuildMember)) {
        newEmbed.setHeader("history for " + member);
      } else {
        newEmbed.setHeader("history for " + member.user.username);
      }

      if (!reaction) return;

      if (reaction == "⬅") {
        if (currentPage <= 0) {
          return pageManager();
        } else {
          currentPage--;
          for (const case0 of pages[currentPage]) {
            let title = `case ${case0.caseId}`;

            if (case0.evidence?.id)
              title = `[case ${case0.caseId}](https://cdn.nypsi.xyz/evidence/${case0.guildId}/${case0.evidence.id}) `;

            if (case0.deleted) {
              newEmbed.addField(title, "`[deleted]`");
            } else {
              newEmbed.addField(
                title,
                "`" +
                  case0.type +
                  "` - " +
                  case0.command +
                  "\non " +
                  `<t:${Math.floor(case0.time.getTime() / 1000)}:d>`,
              );
            }
          }
          newEmbed.setFooter({
            text: "page " + (currentPage + 1) + "/" + pages.length + " | total: " + cases.length,
          });
          if (currentPage == 0) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            );
          }
          await edit({ embeds: [newEmbed], components: [row] }, msg);
          return pageManager();
        }
      } else if (reaction == "➡") {
        if (currentPage + 1 >= lastPage) {
          return pageManager();
        } else {
          currentPage++;
          for (const case0 of pages[currentPage]) {
            if (case0.deleted) {
              newEmbed.addField(
                case0.caseId.toString(),
                `${case0.evidence?.id ? `[\`[deleted]\`](https://cdn.nypsi.xyz/evidence/${case0.guildId}/${case0.evidence.id})` : "`[deleted`]"}`,
              );
            } else {
              newEmbed.addField(
                case0.caseId.toString(),
                (case0.evidence?.id
                  ? `[\`${case0.type}\`](https://cdn.nypsi.xyz/evidence/${case0.guildId}/${case0.evidence.id})`
                  : `\`${case0.type}\``) +
                  " - " +
                  case0.command +
                  "\non " +
                  `<t:${Math.floor(case0.time.getTime() / 1000)}:d>`,
              );
            }
          }
          newEmbed.setFooter({
            text: "page " + (currentPage + 1) + "/" + pages.length + " | total: " + cases.length,
          });
          if (currentPage + 1 == lastPage) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            );
          }
          await edit({ embeds: [newEmbed], components: [row] }, msg);
          return pageManager();
        }
      }
    };
    return pageManager();
  }
}

cmd.setRun(run);

module.exports = cmd;
