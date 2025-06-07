import dayjs = require("dayjs");
import { readFile, readdir, unlink } from "fs/promises";
import prisma from "../../init/database";
import { Job } from "../../types/Jobs";
import { deleteImage } from "../../utils/functions/image";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import { pluralize } from "../../utils/functions/string";
import Constants from "../../utils/Constants";
import redis from "../../init/redis";

export default {
  name: "purge",
  cron: "0 1 * * *",
  async run(log, manager) {
    const old = dayjs().subtract(900, "days").toDate();

    const d = await prisma.username.deleteMany({
      where: {
        AND: [{ type: "username" }, { createdAt: { lt: old } }],
      },
    });

    if (d.count > 0) log(`${d.count.toLocaleString()} usernames purged`);

    const files = await readdir("./out");
    let filesCount = 0;

    for (const fileName of files) {
      const file = await readFile(`./out/${fileName}`).then((r) =>
        r
          .toString()
          .split("\n")
          .map((i) => {
            try {
              return JSON.parse(i) as { time: number };
            } catch {
              return undefined;
            }
          }),
      );

      let attempts = 0;

      while (attempts < 50) {
        attempts++;
        if (attempts >= 50) break;
        const chosen = Math.floor(Math.random() * file.length);

        if (file[chosen] && file[chosen].time) {
          if (dayjs(file[chosen].time).isBefore(dayjs().subtract(120, "days"))) {
            filesCount++;
            await unlink(`./out/${fileName}`);
            break;
          }
        }
      }
    }

    log(`${filesCount} logs files deleted`);

    const limit = dayjs().subtract(1, "weeks").toDate();

    const c = await prisma.mention.deleteMany({
      where: {
        date: { lte: limit },
      },
    });

    if (c.count > 0) log(`${c.count} mentions purged`);

    const roleLimit = dayjs().subtract(30, "days").toDate();

    const query = await prisma.rolePersist.deleteMany({
      where: {
        createdAt: { lt: roleLimit },
      },
    });

    log(`${query.count.toLocaleString()} role persist data purged`);

    const views = await prisma.profileView.deleteMany({
      where: {
        createdAt: { lte: dayjs().subtract(30, "day").toDate() },
      },
    });

    if (views.count > 0) log(`${views.count.toLocaleString()} monthly views purged`);

    const supportImages = await prisma.images.findMany({
      where: {
        AND: [
          { id: { startsWith: "support/" } },
          { createdAt: { lt: dayjs().subtract(180, "day").toDate() } },
        ],
      },
      select: {
        id: true,
      },
    });

    for (const image of supportImages) {
      await deleteImage(image.id);
    }
    log(`deleted ${supportImages.length} support images`);

    const searchResults = await prisma.images.findMany({
      where: {
        AND: [
          { id: { startsWith: "search_result" } },
          { createdAt: { lt: dayjs().subtract(1, "day").toDate() } },
        ],
      },
    });

    for (const image of searchResults) {
      await deleteImage(image.id);
    }
    log(`deleted ${searchResults.length} search results`);

    const staleTickets = await prisma.supportRequest.findMany({
      where: {
        latestActivity: { lt: dayjs().toDate() },
      },
    });

    if (staleTickets.length > 0) {
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

      log(
        `closed ${staleTickets.length} stale ${pluralize("support request", staleTickets.length)}`,
      );
    }
  },
} satisfies Job;
