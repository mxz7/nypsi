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
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { logger } from "../../../logger";
import { getInventory, selectItem, setInventoryItem } from "../inventory";
import ScratchCard from "../scratchies";
import { addItemUse, createGame } from "../stats";

async function prepare(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
  interaction?: ButtonInteraction
): Promise<any> {
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

  if (!inventory.find((i) => i.item == selected.id) || inventory.find((i) => i.item == selected.id).amount == 0) {
    return send({ embeds: [new ErrorEmbed(`you dont have a ${selected.name}`)] });
  }

  if (selected.role !== "scratch-card") return send({ embeds: [new ErrorEmbed("that is not a scratch card")] });

  await setInventoryItem(message.member, selected.id, inventory.find((i) => i.item == selected.id).amount - 1, false);
  await addItemUse(message.member, selected.id);

  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

  const card = new ScratchCard(message.member, selected);

  const embed = new CustomEmbed(message.member, `**${card.remainingClicks}** clicks left`).setHeader(
    `${message.author.username}'s ${selected.name}`,
    message.author.avatarURL()
  );

  let msg = await send({ embeds: [embed], components: card.getButtons() });

  const play = async (): Promise<void> => {
    const filter = (i: Interaction) => i.user.id == message.author.id;
    let fail = false;

    if (card.remainingClicks <= 0) {
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      inventory = await getInventory(message.member, false);
      const buttons = card.getButtons(true);
      let retry = false;
      const gameId = await createGame({
        bet: 0,
        game: selected.id,
        outcome: JSON.stringify(buttons),
        userId: message.author.id,
        win: card.won,
      });

      embed.setDescription(`**${card.remainingClicks}** clicks left`);
      embed.setFooter({ text: `id: ${gameId}` });

      if (inventory.find((i) => i.item === selected.id) && inventory.find((i) => i.item === selected.id)?.amount > 0) {
        buttons[0].addComponents(
          new ButtonBuilder().setCustomId("retry").setLabel("play again").setStyle(ButtonStyle.Success)
        );
        retry = true;
      }

      msg = await msg.edit({ embeds: [embed], components: buttons });

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
          if ((await redis.get(Constants.redis.nypsi.RESTART)) == "t") {
            if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
              message.react("💀");
            } else {
              response.message.edit({
                embeds: [new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes")],
              });
              return;
            }
          }
          logger.info(`::cmd ${message.guild.id} ${message.author.tag}: replaying ${selected.id}`);
          return prepare(message, args, response);
        }
      }
      return;
    }

    const response = await msg
      .awaitMessageComponent({ filter, time: 90000 })
      .then(async (collected) => {
        await collected.deferUpdate().catch(() => {
          fail = true;
          return play();
        });
        return collected;
      })
      .catch((e) => {
        logger.warn(e);
        fail = true;
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        message.channel.send({ content: message.author.toString() + " scratch card expired" });
      });

    if (fail) return;

    if (!response || !response.isButton()) return;

    await card.clicked(response);

    if (card.remainingClicks !== 0) {
      embed.setDescription(`**${card.remainingClicks}** clicks left`);
      await msg.edit({ embeds: [embed], components: card.getButtons() });
    }
    return play();
  };
  return play();
}

module.exports = new ItemUse(
  "scratch_card",
  (message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) => {
    return prepare(message, args);
  }
);
