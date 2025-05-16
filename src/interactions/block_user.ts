import { MessageFlags } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { CustomEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import { getBlockedList, setBlockedList } from "../utils/functions/economy/offers";
import { isEcoBanned } from "../utils/functions/economy/utils";
import { getLastKnownUsername } from "../utils/functions/users/tag";

export default {
  name: "block-user",
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

    const offer = await prisma.offer.findUnique({
      where: {
        messageId: interaction.message.id,
      },
    });

    if (!offer) {
      return await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const current = await getBlockedList(interaction.user.id);

    if (!current.includes(offer.ownerId)) current.push(offer.ownerId);

    await setBlockedList(interaction.user.id, current);

    await redis.del(`${Constants.redis.nypsi.OFFER_PROCESS}:${interaction.user.id}`);

    return interaction.editReply({
      embeds: [
        new CustomEmbed(
          null,
          `✅ added **${await getLastKnownUsername(offer.ownerId)}** to your block list`,
        ),
      ],
    });
  },
} as InteractionHandler;
