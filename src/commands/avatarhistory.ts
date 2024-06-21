import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { formatDate } from "../utils/functions/date";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { uploadImage } from "../utils/functions/image";
import PageManager from "../utils/functions/page";
import {
  addNewAvatar,
  clearAvatarHistory,
  deleteAvatar,
  fetchAvatarHistory,
  isTracking,
} from "../utils/functions/users/history";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("avatarhistory", "view a user's avatar history", "info").setAliases([
  "avh",
  "avhistory",
  "pfphistory",
  "pfph",
]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  if (args.length > 0 && args[0].toLowerCase() == "-clear") {
    await clearAvatarHistory(message.member);
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ your avatar history has been cleared")],
    });
  }

  await addCooldown(cmd.name, message.member, 15);

  if ((await getRawLevel(message.member).catch(() => 0)) < 100)
    return message.channel.send({
      embeds: [
        new ErrorEmbed(
          "you require at least level 100 (/profile) for nypsi to track your avatars\n\nyou can disable avatar tracking with $toggletracking",
        ),
      ],
    });

  let history = await fetchAvatarHistory(message.member);

  if (history.length == 0) {
    const url = await uploadImage(
      message.client as NypsiClient,
      message.author.displayAvatarURL({ extension: "png", size: 256 }),
      "avatar",
      `user: ${message.author.id} (${message.author.username})`,
    );
    if (url) {
      await addNewAvatar(message.member, url);
      history = await fetchAvatarHistory(message.member);
    } else {
      return message.channel.send({ embeds: [new ErrorEmbed("no avatar history")] });
    }
  }

  let index = 0;

  if (parseInt(args[1]) - 1) {
    index = parseInt(args[1]) - 1;

    if (!history[index]) index = 0;
  }

  const embed = new CustomEmbed(message.member)
    .setHeader("your avatar history")
    .setImage(history[index].value)
    .setFooter({ text: formatDate(history[index].createdAt) });

  if (history.length > 1) {
    embed.setFooter({
      text: `${formatDate(history[index].createdAt)} | ${index + 1}/${history.length}`,
    });
  }

  if (!(await isTracking(message.member))) {
    embed.setDescription("`[tracking disabled]`");
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("d").setLabel("delete").setStyle(ButtonStyle.Danger),
  );

  let msg: Message;

  if (history.length == 1) {
    return await message.channel.send({ embeds: [embed] });
  } else {
    msg = await message.channel.send({ embeds: [embed], components: [row] });
  }

  const manager = new PageManager({
    message: msg,
    embed,
    row,
    userId: message.author.id,
    allowMessageDupe: false,
    pages: PageManager.createPages(history, 1),
    handleResponses: new Map().set(
      "d",
      async (manager: PageManager<string>, interaction: ButtonInteraction) => {
        const res = await deleteAvatar(history[manager.currentPage - 1].id);

        if (res) {
          await interaction
            .reply({
              embeds: [new CustomEmbed(message.member, "✅ successfully deleted this avatar")],
              ephemeral: true,
            })
            .catch(() => {
              interaction.followUp({
                embeds: [new CustomEmbed(message.member, "✅ successfully deleted this avatar")],
                ephemeral: true,
              });
            });
        } else {
          await interaction
            .reply({
              embeds: [new CustomEmbed(message.member, "failed to delete this avatar")],
              ephemeral: true,
            })
            .catch(() => {
              interaction.followUp({
                embeds: [new CustomEmbed(message.member, "failed to delete this avatar")],
                ephemeral: true,
              });
            });
        }

        return manager.listen();
      },
    ),
    updateEmbed(page, embed) {
      embed.setImage(page[0].value);
      embed.setFooter({
        text: `${formatDate(page[0].createdAt)} | ${manager.currentPage}/${manager.lastPage}`,
      });

      return embed;
    },
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;
