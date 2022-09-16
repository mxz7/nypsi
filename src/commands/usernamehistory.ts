import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { formatDate } from "../utils/functions/date";
import { getMember } from "../utils/functions/member";
import { clearUsernameHistory, fetchUsernameHistory, isTracking } from "../utils/functions/users/history";
import { hasProfile } from "../utils/functions/users/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("usernamehistory", "view a user's username history", Categories.INFO).setAliases([
  "un",
  "usernames",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    if (args[0].toLowerCase() == "-clear") {
      await clearUsernameHistory(message.member);
      return message.channel.send({
        embeds: [new CustomEmbed(message.member, "✅ your username history has been cleared")],
      });
    }

    if (!message.mentions.members.first()) {
      member = await getMember(message.guild, args.join(" "));
    } else {
      member = message.mentions.members.first();
    }
  }

  if (!member) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  await addCooldown(cmd.name, message.member, 5);

  if (!(await hasProfile(member))) {
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "this user has no username history")],
    });
  }

  const isUserTracking = await isTracking(member);

  const history = await fetchUsernameHistory(member);

  if (history.length == 0) {
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "this user has no username history")],
    });
  }

  const pages = new Map<number, { value: string; date: Date }[]>();

  for (const item of history) {
    if (pages.size == 0) {
      if (!isUserTracking) {
        pages.set(1, [{ value: "[tracking disabled]", date: new Date() }, item]);
      } else {
        pages.set(1, [item]);
      }
    } else {
      if (pages.get(pages.size).length >= 7) {
        pages.set(pages.size + 1, [item]);
      } else {
        const current = pages.get(pages.size);
        current.push(item);
        pages.set(pages.size, current);
      }
    }
  }

  const embed = new CustomEmbed(message.member)
    .setTitle(member.user.tag)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));

  let description = "";

  for (const item of pages.get(1)) {
    description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`;
  }

  embed.setDescription(description);

  if (pages.size > 1) {
    embed.setFooter({ text: `page 1/${pages.size}` });
  }

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

  if (pages.size == 1) return;

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
        await msg.edit({ components: [] });
      });

    if (!reaction) return;

    const newEmbed = new CustomEmbed(message.member)
      .setTitle(member.user.tag)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }));

    if (reaction == "⬅") {
      if (currentPage <= 1) {
        return pageManager();
      } else {
        currentPage--;

        let description = "";

        for (const item of pages.get(currentPage)) {
          description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`;
        }

        newEmbed.setDescription(description);

        newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
        if (currentPage == 1) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
          );
        }
        await msg.edit({ embeds: [newEmbed], components: [row] });
        return pageManager();
      }
    } else if (reaction == "➡") {
      if (currentPage >= lastPage) {
        return pageManager();
      } else {
        currentPage++;

        let description = "";

        for (const item of pages.get(currentPage)) {
          description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`;
        }

        newEmbed.setDescription(description);

        newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
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
        await msg.edit({ embeds: [newEmbed], components: [row] });
        return pageManager();
      }
    }
  };

  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
