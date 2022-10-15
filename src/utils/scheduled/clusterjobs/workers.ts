import prisma from "../../database/database";
import redis from "../../database/redis";
import { getBaseWorkers } from "../../functions/economy/utils";
import { calcWorkerValues, getWorkers } from "../../functions/economy/workers";
import { getDmSettings } from "../../functions/users/notifications";
import { logger } from "../../logger";
import { CustomEmbed } from "../../models/EmbedBuilders";
import ms = require("ms");
import dayjs = require("dayjs");

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
    const data: any = {
      memberId: userId,
    };

    const workers = await getWorkers(userId);

    const full: string[] = [];

    for (const worker of workers) {
      const { maxStorage } = await calcWorkerValues(worker);

      if (worker.stored >= maxStorage) full.push(worker.workerId);
    }

    if (full.length == workers.length) {
      data.content = "all of your workers are full";
      data.embed = new CustomEmbed().setDescription("all of your workers are full").setColor("#36393f");
    } else if (full.length == 1) {
      data.embed = new CustomEmbed()
        .setDescription(`your ${getBaseWorkers()[full[0]].item_emoji} ${getBaseWorkers()[full[0]].name} is full`)
        .setColor("#36393f");
    } else {
      data.content = `${full.length} of your workers are full`;
      data.embed = new CustomEmbed()
        .setDescription(
          full.map((workerId) => `${getBaseWorkers()[workerId].item_emoji} ${getBaseWorkers()[workerId].name}`).join("\n")
        )
        .setHeader("full workers:")
        .setColor("#36393f");
    }

    await redis.lpush("nypsi:dm:queue", JSON.stringify(data));
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
