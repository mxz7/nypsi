import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { pluralize } from "../../utils/functions/string";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";

export default {
  name: "close stale tickets",
  cron: "0 0 * * *",
  async run(log, manager) {
    const date = new Date();
    date.setDate(date.getDate() - 3);

    const staleTickets = await prisma.supportRequest.findMany({
      where: {
        latestActivity: { lt: new Date() },
      },
    });

    if (staleTickets.length == 0) return;

    const clusterHas = await manager.broadcastEval(
      async (c, { channelId }) => {
        const client = c as unknown as NypsiClient;
        const channel = client.channels.cache.get(channelId);

        if (channel) {
          return client.cluster.id;
        } else {
          return "not-found";
        }
      },
      { context: { channelId: Constants.SUPPORT_CHANNEL_ID } },
    );

    let shard: number;

    for (const i of clusterHas) {
      if (i != "not-found") {
        shard = i;
        break;
      }
    }

    if (isNaN(shard)) {
      return;
    }

    const channelEmbed = new CustomEmbed().setDescription(
      "this support request has been closed due to 3 days of inactivity",
    );
    const sentEmbed = new CustomEmbed().setDescription(
      "your support request has been closed due to 3 days of inactivity",
    );

    for (const support of staleTickets) {
      addNotificationToQueue({
        memberId: support.userId,
        payload: { embed: sentEmbed },
      });

      await manager.broadcastEval(
        async (c, { shard, channelId, embed }) => {
          const client = c as unknown as NypsiClient;
          if (client.cluster.id != shard) return false;

          const channel = client.channels.cache.get(channelId);

          if (!channel) return false;

          if (!channel.isTextBased()) return;
          if (!channel.isThread()) return;

          await channel.send({ embeds: [embed] });

          await channel.setLocked(true).catch(() => {});
          await channel.setArchived(true).catch(() => {});
        },
        { context: { shard: shard, channelId: support.channelId, embed: channelEmbed } },
      );

      await prisma.supportRequest.delete({
        where: {
          userId: support.userId,
        },
      });

      await redis.del(`${Constants.redis.cache.SUPPORT}:${support.userId}`);
    }

    log(`closed ${staleTickets.length} stale ${pluralize("support request", staleTickets.length)}`);
  },
} satisfies Job;
