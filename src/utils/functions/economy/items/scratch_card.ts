import {
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiClient } from "../../../../models/Client";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { addHourlyCommand } from "../../../handlers/commandhandler";
import { logger } from "../../../logger";
import { a } from "../../anticheat";
import { isLockedOut, verifyUser } from "../../captcha";
import { recentCommands } from "../../users/commands";
import { getInventory, selectItem, setInventoryItem } from "../inventory";
import ScratchCard from "../scratchies";
import { addStat, createGame } from "../stats";

async function prepare(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
  interaction?: ButtonInteraction,
): Promise<any> {
  recentCommands.set(message.author.id, Date.now());

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (interaction) {
      return interaction.message.edit(data as BaseMessageOptions);
    }
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    return send({ embeds: [new ErrorEmbed("you have an active game")], ephemeral: true });
  }

  let inventory = await getInventory(message.member);

  const selected = selectItem(args[0].toLowerCase());

  if (!selected || typeof selected == "string") {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
  }

  if (
    !inventory.find((i) => i.item == selected.id) ||
    inventory.find((i) => i.item == selected.id).amount == 0
  ) {
    return send({ embeds: [new ErrorEmbed(`you dont have ${selected.article} ${selected.name}`)] });
  }

  if (selected.role !== "scratch-card")
    return send({ embeds: [new ErrorEmbed("that is not a scratch card")] });

  await setInventoryItem(
    message.member,
    selected.id,
    inventory.find((i) => i.item == selected.id).amount - 1,
  );
  await addStat(message.member, selected.id);

  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

  const card = await new ScratchCard(message.member, selected).setArea();

  const embed = new CustomEmbed(
    message.member,
    `**${card.remainingClicks}** click${card.remainingClicks != 1 ? "s" : ""} left`,
  ).setHeader(`${message.author.username}'s ${selected.name}`, message.author.avatarURL());

  const msg = await send({ embeds: [embed], components: card.getButtons() });

  const play = async (interaction?: ButtonInteraction): Promise<void> => {
    const filter = (i: Interaction) => i.user.id == message.author.id;
    let fail = false;

    if (card.remainingClicks <= 0) {
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      inventory = await getInventory(message.member);
      const buttons = card.getButtons(true);
      let retry = false;
      const gameId = await createGame({
        bet: 0,
        game: selected.id,
        outcome: JSON.stringify(buttons),
        userId: message.author.id,
        result: card.won ? "win" : "lose",
      });

      embed.setDescription(
        `**${card.remainingClicks}** click${card.remainingClicks != 1 ? "s" : ""} left`,
      );
      embed.setFooter({ text: `id: ${gameId}` });

      if (
        inventory.find((i) => i.item === selected.id) &&
        inventory.find((i) => i.item === selected.id)?.amount > 0
      ) {
        buttons[0].addComponents(
          new ButtonBuilder()
            .setCustomId("retry")
            .setLabel("play again")
            .setStyle(ButtonStyle.Success),
        );
        retry = true;
      }

      if (interaction && !interaction.deferred && !interaction.replied)
        await interaction
          .update({ embeds: [embed], components: buttons })
          .catch(() => msg.edit({ embeds: [embed], components: buttons }));
      else await msg.edit({ embeds: [embed], components: buttons });

      if (retry) {
        const response = await msg
          .awaitMessageComponent({ filter, time: 90000 })
          .then(async (collected) => {
            await collected.deferUpdate();
            return collected;
          })
          .catch(() => {
            fail = true;
            redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
            msg.edit({ components: card.getButtons(true) });
          });

        if (fail) return;

        if (!response || !response.isButton()) return;

        if (response.customId === "retry") {
          if (
            (await redis.get(
              `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
            )) == "t"
          ) {
            if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
              message.react("💀");
            } else {
              response.message.edit({
                embeds: [
                  new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes"),
                ],
              });
              return;
            }
          }

          if (await isLockedOut(message.author.id)) {
            verifyUser(message);
            msg.edit({ embeds: [new ErrorEmbed("please answer the captcha")] });
            return;
          }

          addHourlyCommand(message.member);

          await a(message.author.id, message.author.username, message.content);

          if (await redis.get("nypsi:maintenance")) {
            if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
              message.react("💀");
            } else {
              msg.edit({
                embeds: [
                  new CustomEmbed(
                    message.member,
                    "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress",
                  ).setTitle("⚠️ nypsi is under maintenance"),
                ],
              });
              return;
            }
          }

          logger.info(
            `::cmd ${message.guild.id} ${message.author.username}: replaying ${selected.id}`,
          );
          return prepare(message, args, response);
        }
      }
      return;
    }

    const response = await msg
      .awaitMessageComponent({ filter, time: 90000 })
      .then(async (collected) => {
        setTimeout(() => {
          collected.deferUpdate().catch(() => null);
        }, 1500);
        return collected;
      })
      .catch(() => {
        fail = true;
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        message.channel.send({ content: message.author.toString() + " scratch card expired" });
      });

    if (fail) return;

    if (!response || !response.isButton()) return;

    await card.clicked(response).catch((e: any) => {
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      logger.error("scratch card weird error !", { card, interactionId: interaction.customId });
      console.error(e);
      logger.error("follow up", e);
      console.trace();

      fail = true;
    });

    // if (fail) return play(response);
    if (fail) return; // in case it causes problems cause i cant recreate

    if (card.remainingClicks !== 0) {
      embed.setDescription(
        `**${card.remainingClicks}** click${card.remainingClicks != 1 ? "s" : ""} left`,
      );

      if (response.deferred || response.replied)
        await msg
          .edit({ embeds: [embed], components: card.getButtons(card.remainingClicks == 0) })
          .catch(() => {
            redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
          });
      else
        await response
          .update({
            embeds: [embed],
            components: card.getButtons(card.remainingClicks == 0),
          })
          .catch(() =>
            msg
              .edit({ embeds: [embed], components: card.getButtons(card.remainingClicks == 0) })
              .catch(() => {
                redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
              }),
          );
    }

    return play(response);
  };
  return play();
}

module.exports = new ItemUse(
  "scratch_card",
  (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction), args: string[]) => {
    return prepare(message, args);
  },
);
