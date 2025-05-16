import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Guild,
  GuildMember,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { exec } from "node:child_process";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { isAltPunish } from "../utils/functions/guilds/altpunish";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import {
  addAlt,
  deleteAlt,
  getAllGroupAccountIds,
  getAlts,
  getMainAccountId,
  isAlt,
  isMainAccount,
} from "../utils/functions/moderation/alts";
import { newBan } from "../utils/functions/moderation/ban";
import { getMuteRole, isMuted, newMute } from "../utils/functions/moderation/mute";
import { getLastKnownAvatar, getLastKnownUsername } from "../utils/functions/users/tag";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");
import { createUser, userExists } from "../utils/functions/economy/utils";

const cmd = new Command("alts", "view a user's alts", "moderation")
  .setAliases(["alt", "account", "accounts"])
  .setPermissions(["MANAGE_MESSAGES", "MODERATE_MEMBERS"]);

cmd.slashEnabled = false;
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

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("alts help")
      .addField(
        "info",
        "keep track of a user's alts in one easy place\n\nalts of a user can be automatically punished with their main\naccount when one is punished (/settings server alt-punish)\n[more info](https://nypsi.xyz/docs/moderation/alt-punish?ref=bot-alts)",
      )
      .addField("usage", `${prefix}alts @user\n${prefix}alts <user ID or tag>`);

    return send({ embeds: [embed] });
  }

  let memberId = (await getMember(message.guild, args.join(" ")))?.user.id;
  let inServer = true;

  if (!memberId) {
    if (args[0].match(Constants.SNOWFLAKE_REGEX)) {
      memberId = args[0];
      inServer = false;
    }
  }

  if (!memberId) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (!(await userExists(memberId)))
    await createUser(inServer ? (await getMember(message.guild, args.join(" "))) : args[0]);

  if (await isAlt(message.guild, memberId)) {
    memberId = await getMainAccountId(message.guild, memberId);
  }

  const msg = await send({
    embeds: [await getEmbed(message, memberId)],
    components: [await getRow(message, memberId)],
  });

  const waitForButton = async (altMsg: Message): Promise<void> => {
    const filter = (i: Interaction) => i.user.id == message.author.id;

    const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(async () => {
      await msg.edit({ components: [] });
    });

    if (!res) return;

    await res.deferReply();

    if (res.customId === "add-alt") {
      await res.editReply({
        embeds: [new CustomEmbed(message.member, "send user id")],
      });

      const msg = await message.channel
        .awaitMessages({
          filter: (msg: Message) => msg.author.id === message.author.id,
          max: 1,
          time: 30000,
        })
        .then((collected) => collected.first())
        .catch(() => {
          res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
        });

      if (!msg) return;
      if (!msg.content.match(Constants.SNOWFLAKE_REGEX)) {
        await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid user")] });
        return waitForButton(altMsg);
      }

      if (msg.content === memberId) {
        await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid user")] });
        return waitForButton(altMsg);
      }

      if (await isMainAccount(message.guild, msg.content)) {
        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              `\`${msg.content}\` is a main account, use **${prefix}alts ${msg.content}** to add an alt to them`,
            ),
          ],
        });
        return waitForButton(altMsg);
      }

      const addAltRes = await addAlt(message.guild, memberId, msg.content);

      if (addAltRes) {
        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              `✅ added \`${msg.content}\` as an alt for ${`\`${memberId}\``}`,
            ),
          ],
        });

        exec(`redis-cli KEYS "*economy:banned*" | xargs redis-cli DEL`);

        if (await isAltPunish(message.guild)) {
          const accountIds = await getAllGroupAccountIds(message.guild, memberId);

          const muted: string[] = [];

          for (const id of accountIds) {
            if (await isMuted(message.guild, id)) {
              muted.push(id);
            }
          }

          if (muted.length > 0) {
            const query = await prisma.moderationMute.findFirst({
              where: {
                AND: [{ guildId: message.guild.id }, { userId: { in: muted } }],
              },
              select: {
                expire: true,
              },
            });

            if (query) {
              await newMute(
                message.guild,
                accountIds.filter((i) => !muted.includes(i)),
                query.expire,
              );
            }

            for (const id of accountIds.filter((i) => !muted.includes(i))) {
              const member = await message.guild.members.fetch(id).catch(() => {});

              if (member) {
                const muteRole = await getMuteRole(message.guild);

                if (muteRole === "timeout") {
                  let time = query.expire.getTime() - Date.now();
                  if (time > ms("28 days")) time = ms("28 days");
                  await member.timeout(time, "in group of muted accounts");
                } else {
                  await member.roles.add(muteRole).catch(() => {});
                }
              }
            }
          }

          const banned: string[] = [];

          for (const id of accountIds) {
            const ban = await message.guild.bans.fetch(id).catch(() => {});
            if (ban) {
              banned.push(id);
            }
          }

          if (banned.length > 0) {
            const banQuery = await prisma.moderationBan.findFirst({
              where: {
                AND: [{ guildId: message.guild.id }, { userId: { in: banned } }],
              },
              select: {
                expire: true,
              },
            });

            if (banQuery) {
              await newBan(
                message.guild,
                accountIds.filter((i) => !banned.includes(i)),
                banQuery.expire,
              );
            }

            for (const id of accountIds.filter((i) => !banned.includes(i))) {
              await message.guild.bans
                .create(id, { reason: "in group of banned accounts" })
                .catch(() => {});
            }
          }
        }
      } else {
        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              `user is already an alt of ${await getMainAccountId(message.guild, msg.content)}`,
            ),
          ],
        });
      }

      await altMsg.edit({
        embeds: [await getEmbed(message, memberId)],
        components: [await getRow(message, memberId)],
      });

      return waitForButton(altMsg);
    } else if (res.customId === "del-alt") {
      await res.editReply({
        embeds: [new CustomEmbed(message.member, "send user id")],
      });

      const msg = await message.channel
        .awaitMessages({
          filter: (msg: Message) => msg.author.id === message.author.id,
          max: 1,
          time: 30000,
        })
        .then((collected) => collected.first())
        .catch(() => {
          res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
        });

      if (!msg) return;
      console.log(await isAlt(message.guild, msg.content));
      console.log(await getMainAccountId(message.guild, msg.content));

      if (
        !(await isAlt(message.guild, msg.content)) ||
        (await getMainAccountId(message.guild, msg.content)) != memberId
      ) {
        await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid alt")] });
        return waitForButton(altMsg);
      }

      await deleteAlt(message.guild, msg.content);
      await res.editReply({
        embeds: [
          new CustomEmbed(
            message.member,
            `✅ removed \`${msg.content}\` as an alt for ${memberId}`,
          ),
        ],
      });
      exec(`redis-cli KEYS "*economy:banned*" | xargs redis-cli DEL`);
      await altMsg.edit({
        embeds: [await getEmbed(message, memberId)],
        components: [await getRow(message, memberId)],
      });
      return waitForButton(altMsg);
    }
  };
  return waitForButton(msg);
}

async function getEmbed(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  member: string,
) {
  const alts = await getUserAlts(message.guild, member);

  const embed = new CustomEmbed(message.member);

  const username = await getLastKnownUsername(member);

  embed.setHeader(
    "alts of " + username ? username + ` (${member})` : member,
    await getLastKnownAvatar(member),
  );

  if (alts.length == 0) {
    embed.setDescription("no alts to display");
  } else {
    const altList: string[] = [];
    for (const alt of alts) {
      altList.push(
        `${
          (await getLastKnownUsername(alt)) ? (await getLastKnownUsername(alt)) + " " : ""
        }\`${alt}\``,
      );
    }
    embed.setDescription(altList.join("\n"));
  }

  return embed;
}

async function getRow(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  member: string,
) {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("add-alt").setLabel("add alt").setStyle(ButtonStyle.Success),
  );
  if ((await getUserAlts(message.guild, member)).length > 0)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("del-alt")
        .setLabel("remove alt")
        .setStyle(ButtonStyle.Danger),
    );

  return row;
}

async function getUserAlts(guild: Guild, member: GuildMember | string) {
  return await getAlts(guild, member instanceof GuildMember ? member.user.id : member).catch(
    () => [] as string[],
  );
}

cmd.setRun(run);

module.exports = cmd;
