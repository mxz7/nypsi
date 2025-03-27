import prisma from "../init/database";
import redis from "../init/redis";
import { CustomEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { isEcoBanned } from "../utils/functions/economy/utils";
import { getPreferences, updatePreferences } from "../utils/functions/users/notifications";

export default {
  name: "disable-offers",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;

    if (await redis.exists(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`)) {
      return interaction.reply({
        embeds: [
          new CustomEmbed(interaction.user.id, "please wait until your offer has been processed"),
        ],
        ephemeral: true,
      });
    }

    await redis.set(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`, "t", "EX", 69);

    const offer = await prisma.offer.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    if (!offer) {
      return await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
    }

    await interaction.deferReply({ ephemeral: true });

    const preferences = await getPreferences(interaction.user.id);

    preferences.offers = 0;

    await updatePreferences(interaction.user.id, preferences);

    await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);

    return interaction.editReply({
      embeds: [new CustomEmbed(null, "✅ you will not receive anymore offers")],
    });
  },
} as InteractionHandler;
