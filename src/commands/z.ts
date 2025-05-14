import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getExactMember, getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { getLastKnownAvatar, getLastKnownUsername } from "../utils/functions/users/tag";
import {
  castVoteKick,
  checkZPeoples,
  getZProfile,
  invite,
  removeVoteKick,
  z,
} from "../utils/functions/z";
import { addCooldown, onCooldown } from "../utils/handlers/cooldownhandler";

let checking = false;

const cmd = new Command("z", "z", "none");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) return;

  if (message.channelId !== Constants.Z_CHANNEL) {
    await addCooldown(cmd.name, message.member, 10);
    return (message as Message).react("💤");
  }

  const profile = await getZProfile(message.author.id);

  if (!profile || profile.removed) {
    await addCooldown(cmd.name, message.member, 10);
    return (message as Message).react("💤");
  }

  const showProfile = async (profile: z) => {
    const render = async (msg?: Message) => {
      const embed = new CustomEmbed(
        profile.userId,
        `joined: <t:${Math.floor(new Date(profile.createdAt).valueOf() / 1000)}>\n` +
          `invited by: ${profile.invitedById ? await getLastKnownUsername(profile.invitedById) : ""} \`${profile.invitedById}\`\n` +
          `has invite: ${profile.hasInvite}\n` +
          `removed: ${profile.removed}\n` +
          `rating: ${profile.rating}\n` +
          `kick: ${profile.voteKicks.length}/${Math.ceil((await prisma.z.count({ where: { removed: false } })) / 5)}`,
      ).setHeader(
        await getLastKnownUsername(profile.userId),
        await getLastKnownAvatar(profile.userId),
      );

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("invites")
          .setLabel("invites")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("kick").setLabel("kick").setStyle(ButtonStyle.Danger),
      );

      if (profile.removed) {
        row.components.splice(1, 1);
      }

      if (msg) msg.edit({ embeds: [embed], components: [row] });
      else msg = await message.channel.send({ embeds: [embed], components: [row] });
      return msg;
    };

    const msg = await render();

    const listen = async () => {
      const interaction = await msg
        .awaitMessageComponent({
          filter: (i) => i.user.id === message.author.id,
          time: 60000,
          componentType: ComponentType.Button,
        })
        .catch((): null => null);

      if (!interaction) return;

      if (interaction.customId === "invites") {
        const embed = new CustomEmbed(profile.userId).setHeader(
          `${await getLastKnownUsername(profile.userId)}'s invites`,
          await getLastKnownAvatar(profile.userId),
        );
        const desc: string[] = [];

        for (const invite of profile.invitees) {
          desc.push(`${await getLastKnownUsername(invite.userId)} \`${invite.userId}\``);
        }

        if (desc.length === 0) desc.push("none");

        embed.setDescription(desc.join("\n"));

        interaction.reply({ embeds: [embed] });
      } else if (interaction.customId === "kick") {
        if (profile.userId === message.author.id)
          return interaction.reply({ embeds: [new ErrorEmbed("masochist")] });

        if (!profile.invitedById)
          return interaction.reply({
            embeds: [new ErrorEmbed("cannot vote kick a founding father")],
          });

        if (profile.voteKicks.find((i) => i.userId === message.author.id)) {
          const res = await removeVoteKick(message.author.id, profile.userId);
          profile = await getZProfile(profile.userId);
          render(msg);

          if (res === "removed") {
            await interaction.reply({
              embeds: [new CustomEmbed(message.member, "✅ removed vote kick")],
            });
          } else if (res === "no vote kick") {
            await interaction.reply({ embeds: [new ErrorEmbed("no vote kick")] });
          } else if (res === "already removed") {
            await interaction.reply({
              embeds: [new ErrorEmbed("this user has been removed already. this is irreversible")],
            });
          } else {
            await interaction.reply({ embeds: [new ErrorEmbed("user not exist error")] });
          }
        } else {
          const res = await castVoteKick(message.author.id, profile.userId, message.guild);
          profile = await getZProfile(profile.userId);

          if (res === "already voted") {
            await interaction.reply({ embeds: [new ErrorEmbed("already voted")] });
          } else if (res === "founding father") {
            await interaction.reply({
              embeds: [new ErrorEmbed("cannot vote kick a founding father")],
            });
          } else if (res === "no target profile") {
            await interaction.reply({ embeds: [new ErrorEmbed("user not exist error")] });
          } else if (res === "no user profile") {
            await interaction.reply({ embeds: [new ErrorEmbed("user not exist error")] });
          } else if (res === "already removed") {
            await interaction.reply({ embeds: [new ErrorEmbed("already kicked from z")] });
          } else {
            await interaction.reply({
              embeds: [
                new CustomEmbed(
                  message.member,
                  `✅ voted to kick ${await getLastKnownUsername(profile.userId)}`,
                ),
              ],
            });
          }
        }
      }

      listen();
    };

    listen();
  };

  let memberId: string;

  if (args.length === 0) {
    if (!checking) {
      checking = true;
      checkZPeoples(message.guild).then(() => (checking = false));
    }
    memberId = message.author.id;
  } else if (args[0].toLowerCase() === "invite") {
    if (!profile.hasInvite)
      return message.channel.send({
        embeds: [new ErrorEmbed("you don't have an available invite loser.")],
      });

    if (!args[1]) return message.channel.send({ content: "dumbass - $z invite <username>" });
    const member = await getExactMember(message.guild, args[1]);

    if (!member) {
      return message.channel.send({ embeds: [new ErrorEmbed("exact username or id")] });
    }

    return invite(message.author.id, member.id, message.guild);
  } else if (args[0].toLowerCase() === "members") {
    const users = await prisma.z.findMany({
      select: { userId: true, removed: true },
      orderBy: { user: { lastKnownUsername: "asc" } },
    });

    const desc: string[] = [];

    for (const user of users) {
      desc.push(
        user.removed
          ? `~~${await getLastKnownUsername(user.userId)}~~`
          : await getLastKnownUsername(user.userId),
      );
    }

    const pages = PageManager.createPages(desc);

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n")).setHeader(
      "z members",
      message.guild.iconURL(),
    );

    if (pages.size === 0) return message.channel.send({ embeds: [new ErrorEmbed("no members")] });

    if (pages.size === 1) return message.channel.send({ embeds: [embed] });

    const row = PageManager.defaultRow();

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      message: msg,
      embed,
      row,
      pages,
      userId: message.author.id,
    });

    return manager.listen();
  } else {
    memberId = await getMember(message.guild, args.join(" ")).then((i) => i.user.id);

    if (!memberId) {
      memberId = args[0];
    }

    if (!memberId.match(Constants.SNOWFLAKE_REGEX)) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  if (!memberId) {
    return (message as Message).react("💤");
  }

  showProfile(await getZProfile(memberId));
}

cmd.setRun(run);

module.exports = cmd;
