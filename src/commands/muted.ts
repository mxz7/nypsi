import { CommandInteraction, Message, PermissionFlagsBits, User } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getMutedUsers } from "../utils/functions/moderation/mute";

import PageManager from "../utils/functions/page";
import { escapeSpecialCharacters } from "../utils/functions/string";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "muted",
  "view the currently muted members in the server",
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

  const muted = await getMutedUsers(message.guild);

  if (!muted || muted.length == 0) {
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "there is no one currently muted with nypsi")],
    });
  }

  await addCooldown(cmd.name, message.member, 10);

  const pageItems: string[] = [];

  for (const m of muted) {
    const username = escapeSpecialCharacters(
      (await getLastKnownUsername(m.userId)) ??
        (await message.client.users.fetch(m.userId).catch(() => undefined as User))?.username ??
        "",
    );

    const msg = `${username ? `${username} ` : ""} \`${m.userId}\` ${
      m.expire.getTime() >= 3130000000000
        ? "is permanently muted"
        : `will be unmuted <t:${Math.floor(m.expire.getTime() / 1000)}:R>`
    }`;

    pageItems.push(msg);
  }

  const pages = PageManager.createPages(pageItems);

  const embed = new CustomEmbed(message.member).setHeader("muted users", message.guild.iconURL());

  embed.setDescription(pages.get(1).join("\n"));

  let msg: Message;

  if (pages.size == 1) {
    return await message.channel.send({ embeds: [embed] });
  } else {
    msg = await message.channel.send({ embeds: [embed], components: [PageManager.defaultRow()] });
  }

  const manager = new PageManager({
    message: msg,
    embed,
    pages,
    userId: message.author.id,
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
