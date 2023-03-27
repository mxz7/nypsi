import { EmbedBuilder } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { addInventoryItem, getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { getItems, isEcoBanned } from "../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";

export default {
  name: "accept-offer",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if (await isEcoBanned(interaction.user.id)) return;

    if (await redis.exists(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`)) {
      return interaction.reply({
        embeds: [
          new CustomEmbed(null, "please wait until your other offer has processed").setColor(
            Constants.TRANSPARENT_EMBED_COLOR
          ),
        ],
        ephemeral: true,
      });
    }

    await redis.set(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`, "t");
    await redis.expire(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`, 69);

    const offer = await prisma.offer.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    if (!offer) {
      return await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
    }

    await interaction.deferReply();

    const inventory = await getInventory(interaction.user.id, false);

    if (
      !inventory.find((i) => i.item === offer.itemId) ||
      inventory.find((i) => i.item === offer.itemId).amount < offer.itemAmount
    ) {
      await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
      return interaction.editReply({ embeds: [new ErrorEmbed("you don't have the items for this offer")] });
    }

    await prisma.offer.delete({
      where: {
        messageId: offer.messageId,
      },
    });

    await setInventoryItem(
      interaction.user.id,
      offer.itemId,
      inventory.find((i) => i.item === offer.itemId).amount - Number(offer.itemAmount),
      false
    );
    await updateBalance(interaction.user.id, (await getBalance(interaction.user.id)) + Number(offer.money));
    await addInventoryItem(offer.ownerId, offer.itemId, Number(offer.itemAmount));

    await interaction.editReply({
      embeds: [new CustomEmbed(null, "offer accepted").setColor(Constants.EMBED_SUCCESS_COLOR)],
    });

    const embed = new EmbedBuilder(interaction.message.embeds[0]);

    embed.setDescription((embed.data.description.split("\n")[0] += "\n\n**offer accepted**"));

    await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);

    await interaction.message.edit({ embeds: [embed], components: [] });

    if ((await getDmSettings(offer.ownerId)).auction) {
      await addNotificationToQueue({
        memberId: offer.ownerId,
        payload: {
          content: `your offer to ${interaction.user.tag} for ${offer.itemAmount}x ${
            getItems()[offer.itemId].name
          } has been accepted`,
        },
      });
    }
  },
} as InteractionHandler;
