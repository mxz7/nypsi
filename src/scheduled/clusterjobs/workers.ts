import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { NotificationPayload } from "../../types/Notification";
import { getBaseWorkers } from "../../utils/functions/economy/utils";
import { calcWorkerValues, getWorkers } from "../../utils/functions/economy/workers";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import ms = require("ms");
import dayjs = require("dayjs");
import Constants from "../../utils/Constants";

async function doWorkerThing() {
  const query = await prisma.economyWorker.findMany({
    include: {
      upgrades: true,
    },
  });

  const dms = new Set<string>();

  for (const worker of query) {
    const { maxStorage, perInterval } = await calcWorkerValues(worker);

    if (worker.stored >= maxStorage) continue;

    let incrementAmount = perInterval;

    if (worker.stored + incrementAmount > maxStorage) {
      incrementAmount = maxStorage - worker.stored;

      if ((await getDmSettings(worker.userId)).worker) {
        dms.add(worker.userId);
      }
    }

    await prisma.economyWorker.update({
      where: {
        userId_workerId: {
          userId: worker.userId,
          workerId: worker.workerId,
        },
      },
      data: {
        stored: {
          increment: incrementAmount,
        },
      },
    });
  }

  let amount = 0;

  for (const userId of Array.from(dms.keys())) {
    const data: NotificationPayload = {
      memberId: userId,
      payload: null,
    };

    const workers = await getWorkers(userId);

    const full: string[] = [];

    for (const worker of workers) {
      const { maxStorage } = await calcWorkerValues(worker);

      if (worker.stored >= maxStorage) full.push(worker.workerId);
    }

    if (full.length == workers.length) {
      data.payload.content = "all of your workers are full";
      data.payload.embed = new CustomEmbed()
        .setDescription("all of your workers are full")
        .setColor(Constants.TRANSPARENT_EMBED_COLOR);
    } else if (full.length == 1) {
      data.payload.embed = new CustomEmbed()
        .setDescription(`your ${getBaseWorkers()[full[0]].item_emoji} ${getBaseWorkers()[full[0]].name} is full`)
        .setColor(Constants.TRANSPARENT_EMBED_COLOR);
    } else {
      data.payload.content = `${full.length} of your workers are full`;
      data.payload.embed = new CustomEmbed()
        .setDescription(
          full.map((workerId) => `${getBaseWorkers()[workerId].item_emoji} ${getBaseWorkers()[workerId].name}`).join("\n")
        )
        .setHeader("full workers:")
        .setColor(Constants.TRANSPARENT_EMBED_COLOR)
        .setFooter({ text: "/settings me notifications" });
    }

    await addNotificationToQueue(data);
    amount++;
  }

  if (amount > 0) logger.info(`${amount} worker notifications queued`);
}

export function runWorkerInterval() {
  const nextHour = dayjs().add(1, "hour").set("minutes", 0).set("seconds", 0);
  const msNeeded = nextHour.diff(dayjs(), "milliseconds");

  setTimeout(() => {
    doWorkerThing();

    setInterval(doWorkerThing, ms("1 hour"));
  }, msNeeded);
}
