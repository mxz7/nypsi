import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getMutedUsers } from "../utils/functions/moderation/mute";
import { createProfile, profileExists } from "../utils/functions/moderation/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("muted", "view the currently muted members in the server", Categories.MODERATION).setPermissions([
  "MANAGE_MESSAGES",
  "MODERATE_MEMBERS",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  if (!(await profileExists(message.guild))) await createProfile(message.guild);

  const muted = await getMutedUsers(message.guild);

  if (!muted || muted.length == 0) {
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "there is noone currently muted with nypsi")],
    });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 15);

  const pages = new Map<number, string[]>();

  for (const m of muted) {
    const user: GuildMember | void = await message.guild.members.fetch(m.userId).catch(() => {});

    const msg = `\`${user ? user.user.tag : m.userId}\` ${
      m.expire.getTime() >= 3130000000000
        ? "is permanently muted"
        : `will be unmuted <t:${Math.floor(m.expire.getTime() / 1000)}:R>`
    }`;

    if (pages.size == 0) {
      const page1 = [];
      page1.push(msg);
      pages.set(1, page1);
    } else {
      const lastPage = pages.size;

      if (pages.get(lastPage).length > 10) {
        const newPage = [];
        newPage.push(msg);
        pages.set(pages.size + 1, newPage);
      } else {
        pages.get(lastPage).push(msg);
      }
    }
  }

  const embed = new CustomEmbed(message.member).setHeader("muted users");

  embed.setDescription(pages.get(1).join("\n"));
  embed.setFooter({ text: `1/${pages.size}` });

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
  );

  let msg: Message;

  if (pages.size == 1) {
    return await message.channel.send({ embeds: [embed] });
  } else {
    msg = await message.channel.send({ embeds: [embed], components: [row] });
  }

  let currentPage = 1;
  const lastPage = pages.size;

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager = async (): Promise<void> => {
    const reaction = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });

    if (!reaction) return;

    if (reaction == "⬅") {
      if (currentPage <= 1) {
        return pageManager();
      } else {
        currentPage--;

        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `${currentPage}/${lastPage}` });

        if (currentPage == 1) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
          );
        }
        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      }
    } else {
      if (currentPage >= lastPage) {
        return pageManager();
      } else {
        currentPage++;

        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `${currentPage}/${lastPage}` });

        if (currentPage == lastPage) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
          );
        }
      }
    }
  };
  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
