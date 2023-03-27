import prisma from "../init/database";
import redis from "../init/redis";
import { CustomEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { getBlockedList, setBlockedList } from "../utils/functions/economy/offers";
import { isEcoBanned } from "../utils/functions/economy/utils";

export default {
  name: "block-user",
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

    const current = await getBlockedList(interaction.user.id);

    if (!current.includes(offer.ownerId)) current.push(offer.ownerId);

    await setBlockedList(interaction.user.id, current);

    return interaction.editReply({
      embeds: [new CustomEmbed(null, `✅ added \`${offer.ownerId}\` to your block list`)],
    });
  },
} as InteractionHandler;
