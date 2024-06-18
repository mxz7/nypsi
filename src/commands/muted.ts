import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getMutedUsers } from "../utils/functions/moderation/mute";

import PageManager from "../utils/functions/page";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "muted",
  "view the currently muted members in the server",
  "moderation",
).setPermissions(["MANAGE_MESSAGES", "MODERATE_MEMBERS"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const muted = await getMutedUsers(message.guild);

  if (!muted || muted.length == 0) {
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "there is no one currently muted with nypsi")],
    });
  }

  await addCooldown(cmd.name, message.member, 15);

  const pageItems: string[] = [];

  for (const m of muted) {
    const user = await message.client.users.fetch(m.userId);
    const username = await getLastKnownUsername(m.userId);

    const msg = `${user ? `${user.username} ` : username ? `${username} ` : null}\`${m.userId}\` ${
      m.expire.getTime() >= 3130000000000
        ? "is permanently muted"
        : `will be unmuted <t:${Math.floor(m.expire.getTime() / 1000)}:R>`
    }`;

    pageItems.push(msg);
  }

  const pages = PageManager.createPages(pageItems);

  const embed = new CustomEmbed(message.member).setHeader("muted users");

  embed.setDescription(pages.get(1).join("\n"));
  embed.setFooter({ text: `1/${pages.size}` });

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
    return await message.channel.send({ embeds: [embed] });
  } else {
    msg = await message.channel.send({ embeds: [embed], components: [row] });
  }

  const manager = new PageManager({
    message: msg,
    embed,
    row,
    pages,
    userId: message.author.id,
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
