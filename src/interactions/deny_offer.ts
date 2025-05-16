import { EmbedBuilder, MessageFlags } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { addBalance } from "../utils/functions/economy/balance";
import { getItems, isEcoBanned } from "../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";

export default {
  name: "deny-offer",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;

    if (await redis.exists(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`)) {
      return interaction.reply({
        embeds: [
          new CustomEmbed(interaction.user.id, "please wait until your offer has been processed"),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await redis.set(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`, "t", "EX", 69);

    const offer = await prisma.offer.findFirst({
      where: {
        AND: [{ messageId: interaction.message.id }, { sold: false }],
      },
    });

    if (!offer) {
      return await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
    }

    if ((await isEcoBanned(offer.ownerId)).banned) {
      await prisma.offer.delete({
        where: {
          messageId: offer.messageId,
        },
      });
      await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
      return interaction.reply({ embeds: [new ErrorEmbed("they are banned.")] });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await prisma.offer.delete({
      where: {
        messageId: offer.messageId,
      },
    });

    await addBalance(offer.ownerId, Number(offer.money));

    await interaction.editReply({
      embeds: [new CustomEmbed(null, "offer denied").setColor(Constants.EMBED_SUCCESS_COLOR)],
    });

    const embed = new EmbedBuilder(interaction.message.embeds[0]);

    embed.setDescription((embed.data.description.split("\n")[0] += "\n\n**offer denied**"));
    embed.setColor(Constants.EMBED_FAIL_COLOR);

    await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);

    await interaction.message.edit({ embeds: [embed], components: [] });

    if ((await getDmSettings(offer.ownerId)).auction) {
      addNotificationToQueue({
        memberId: offer.ownerId,
        payload: {
          content: `your offer to ${interaction.user.username} for ${offer.itemAmount}x ${
            getItems()[offer.itemId].name
          } has been denied`,
          embed: new CustomEmbed(
            null,
            `your $${offer.money.toLocaleString()} has been returned`,
          ).setColor(Constants.EMBED_FAIL_COLOR),
        },
      });
    }
  },
} as InteractionHandler;
