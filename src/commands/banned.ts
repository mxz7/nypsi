import { CommandInteraction, Message, PermissionFlagsBits, User } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getBannedUsers } from "../utils/functions/moderation/ban";

import PageManager from "../utils/functions/page";
import { escapeFormattingCharacters } from "../utils/functions/string";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "banned",
  "view the currently banned members in the server",
  "moderation",
).setPermissions(["MANAGE_MESSAGES", "MODERATE_MEMBERS"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return;
    }
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  const banned = await getBannedUsers(message.guild);

  if (!banned || banned.length == 0) {
    return send({
      embeds: [new CustomEmbed(message.member, "there is no one currently banned with nypsi")],
    });
  }

  await addCooldown(cmd.name, message.member, 10);

  const pageItems: string[] = [];

  for (const m of banned) {
    const username = escapeFormattingCharacters(
      (await getLastKnownUsername(m.userId)) ??
        (await message.client.users.fetch(m.userId).catch(() => undefined as User))?.username ??
        "",
    );

    const msg = `${username} \`${m.userId}\` ${
      m.expire.getTime() >= 3130000000000
        ? "is permanently banned"
        : `will be unbanned <t:${Math.floor(m.expire.getTime() / 1000)}:R>`
    }`;

    pageItems.push(msg);
  }

  const pages = PageManager.createPages(pageItems);

  const embed = new CustomEmbed(message.member).setHeader("banned users", message.guild.iconURL());

  embed.setDescription(pages.get(1).join("\n"));

  let msg: Message;

  if (pages.size == 1) {
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [PageManager.defaultRow()] });
  }

  const manager = new PageManager({
    pages,
    message: msg,
    embed,
    userId: message.author.id,
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
