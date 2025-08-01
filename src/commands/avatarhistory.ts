import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { nanoid } from "nanoid";
import s3 from "../init/s3";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { isEcoBanned } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import {
  addNewAvatar,
  clearAvatarHistory,
  deleteAvatar,
  fetchAvatarHistory,
  isTracking,
} from "../utils/functions/users/history";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("avatarhistory", "view a user's avatar history", "info").setAliases([
  "avh",
  "avhistory",
  "pfphistory",
  "pfph",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  if (args.length > 0 && args[0].toLowerCase() == "clear") {
    await clearAvatarHistory(message.member);
    return send({
      embeds: [new CustomEmbed(message.member, "✅ your avatar history has been cleared")],
    });
  }

  await addCooldown(cmd.name, message.member, 10);

  if (
    (await getRawLevel(message.member).catch(() => 0)) < 500 ||
    message.client.user.id !== Constants.BOT_USER_ID
  )
    return send({
      embeds: [
        new ErrorEmbed(
          "you require at least level 500 (prestige 5) (/profile) for nypsi to track your avatars\n\nyou can disable avatar tracking with $toggletracking",
        ),
      ],
    });

  let history = await fetchAvatarHistory(message.member);

  if (history.length == 0) {
    if (
      (await isTracking(message.member)) &&
      !(await isEcoBanned(message.member)
        .then((r) => r.banned)
        .catch(() => false))
    ) {
      const avatar = message.author.avatarURL({ size: 256, extension: "png" });
      const arrayBuffer = await fetch(avatar).then((r) => r.arrayBuffer());
      const ext = avatar.split(".").pop().split("?")[0];
      const key = `avatar/${message.author.id}/${nanoid()}.${ext}`;

      await s3
        .send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: key,
            Body: Buffer.from(arrayBuffer),
            ContentType: `image/${ext}`,
          }),
        )
        .catch((err) => {
          console.error(err);
          logger.error(
            `error uploading avatar of ${message.author.id} (${message.author.username})`,
            { err },
          );
        });

      await addNewAvatar(message.member, `https://cdn.nypsi.xyz/${key}`);
      logger.debug(`uploaded new avatar for ${message.author.id}`);

      history = await fetchAvatarHistory(message.member);
    } else return send({ embeds: [new ErrorEmbed("no avatar history")] });
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
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
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
      async (
        manager: PageManager<{
          id: number;
          createdAt: Date;
          value: string;
        }>,
        interaction: ButtonInteraction,
      ) => {
        const res = await deleteAvatar(history[manager.currentPage - 1].id);

        if (res) {
          history = await fetchAvatarHistory(message.member);
          manager.pages = PageManager.createPages(history, 1);
          manager.lastPage = manager.pages.size;

          if (manager.currentPage > manager.lastPage) manager.currentPage = manager.lastPage;

          await manager.render(manager, interaction);

          interaction.followUp({
            embeds: [new CustomEmbed(message.member, "✅ successfully deleted this avatar")],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction
            .reply({
              embeds: [new CustomEmbed(message.member, "failed to delete this avatar")],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {
              interaction.followUp({
                embeds: [new CustomEmbed(message.member, "failed to delete this avatar")],
                flags: MessageFlags.Ephemeral,
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
