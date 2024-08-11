import dayjs = require("dayjs");
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { addBalance } from "../../utils/functions/economy/balance";
import { getItems } from "../../utils/functions/economy/utils";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import { getLastKnownUsername } from "../../utils/functions/users/tag";
import pAll = require("p-all");

export default {
  name: "netupdate",
  cron: "0 */2 * * *",
  async run(log) {
    const query = await prisma.offer.findMany({
      where: {
        createdAt: { lt: dayjs().subtract(7, "day").toDate() },
      },
      select: {
        itemId: true,
        itemAmount: true,
        money: true,
        targetId: true,
        ownerId: true,
        messageId: true,
      },
    });

    for (const offer of query) {
      await prisma.offer.delete({ where: { messageId: offer.messageId } });
      await addBalance(offer.ownerId, Number(offer.money));

      const embed = new CustomEmbed(
        offer.ownerId,
        `your offer to **${getLastKnownUsername(offer.targetId)}** for ${offer.itemAmount}x ${getItems()[offer.itemId].name} has expired`,
      ).setFooter({ text: `+$${offer.money.toLocaleString()}` });

      addNotificationToQueue({ memberId: offer.ownerId, payload: { embed } });
    }

    log(`${query.length} offers expired`);
  },
} satisfies Job;
