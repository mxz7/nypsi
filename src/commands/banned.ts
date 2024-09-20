import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getBannedUsers } from "../utils/functions/moderation/ban";

import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "banned",
  "view the currently banned members in the server",
  "moderation",
).setPermissions(["MANAGE_MESSAGES", "MODERATE_MEMBERS"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  const banned = await getBannedUsers(message.guild);

  if (!banned || banned.length == 0) {
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "there is no one currently banned with nypsi")],
    });
  }

  await addCooldown(cmd.name, message.member, 15);

  const pages = new Map<number, string[]>();

  for (const m of banned) {
    const user = await message.client.users.fetch(m.userId);
    const username = await getLastKnownUsername(m.userId);

    const msg = `${user ? `${user.username} ` : username ? `${username} ` : null}\`${m.userId}\` ${
      m.expire.getTime() >= 3130000000000
        ? "is permanently banned"
        : `will be unbanned <t:${Math.floor(m.expire.getTime() / 1000)}:R>`
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

  const embed = new CustomEmbed(message.member).setHeader("banned users");

  embed.setDescription(pages.get(1).join("\n"));
  embed.setFooter({ text: `1/${pages.size}` });

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
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
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
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
      }
    }
  };
  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
