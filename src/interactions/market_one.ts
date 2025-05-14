import prisma from "../init/database";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { marketBuy, marketSell } from "../utils/functions/economy/market";
import { NypsiClient } from "../models/Client";

export default {
  name: "market-one",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    const order = await prisma.market.findFirst({
      where: {
        AND: [{ messageId: interaction.message.id }],
      },
    });

    if (!order) {
      await interaction.reply({ embeds: [new ErrorEmbed("invalid order")], ephemeral: true });
      await interaction.message.delete();
      return;
    }

    if (order && !order?.completed && (await userExists(order.ownerId))) {
      if (order.ownerId == interaction.user.id) {
        return await interaction.reply({
          embeds: [new ErrorEmbed("you cannot fulfill your own order")],
          ephemeral: true,
        });
      }

      const res = order.orderType == "buy"
        ? await marketSell(interaction.user.id, order.itemId, 1, Number(order.price), interaction.client as NypsiClient, order)
        : await marketBuy(interaction.user.id, order.itemId, 1, Number(order.price), interaction.client as NypsiClient, order);
        
      if (res && res.status !== "success" && res.status !== "partial") {
        return await interaction.reply({
          embeds: [new ErrorEmbed(res.status)],
          ephemeral: true,
        });
      } else return interaction.deferUpdate();
    } else if (order?.completed || Number(order.itemAmount) === 0) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("too slow ):").removeTitle()],
        ephemeral: true,
      });
    } else {
      await interaction.reply({ embeds: [new ErrorEmbed("invalid order")], ephemeral: true });
      await interaction.message.delete();
    }
  },
} as InteractionHandler;
