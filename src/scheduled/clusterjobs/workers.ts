import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { NotificationPayload } from "../../types/Notification";
import { SteveData } from "../../types/Workers";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { getBalance, updateBalance } from "../../utils/functions/economy/balance";
import { getBoosters } from "../../utils/functions/economy/boosters";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getBaseWorkers } from "../../utils/functions/economy/utils";
import { calcWorkerValues, getWorkers } from "../../utils/functions/economy/workers";
import { percentChance } from "../../utils/functions/random";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import ms = require("ms");
import dayjs = require("dayjs");

async function doWorkerThing() {
  const query = await prisma.economyWorker.findMany({
    include: {
      upgrades: true,
    },
  });

  const dms = new Set<string>();
  const hasSteve = new Set<string>();

  for (const worker of query) {
    const { maxStorage, perInterval, perItem, scrapChance, gemChance } =
      await calcWorkerValues(worker);

    if (!hasSteve.has(worker.userId)) {
      const boosters = await getBoosters(worker.userId);

      if (Array.from(boosters.keys()).includes("steve")) hasSteve.add(worker.userId);
    }

    if (worker.stored >= maxStorage && !hasSteve.has(worker.userId)) continue;

    let incrementAmount = perInterval;

    if (worker.stored + incrementAmount > maxStorage) {
      incrementAmount = maxStorage - worker.stored;

      if ((await getDmSettings(worker.userId)).worker != "Disabled") {
        dms.add(worker.userId);
      }
    }

    if (hasSteve.has(worker.userId)) {
      let steveStorage: SteveData;

      if (await redis.exists(`${Constants.redis.nypsi.STEVE_EARNED}:${worker.userId}`)) {
        steveStorage = JSON.parse(
          await redis.get(`${Constants.redis.nypsi.STEVE_EARNED}:${worker.userId}`),
        );
        steveStorage.money = parseInt(steveStorage.money as unknown as string);
        steveStorage.gemShards = parseInt(steveStorage.gemShards as unknown as string);
        steveStorage.scraps = parseInt(steveStorage.scraps as unknown as string);
      } else {
        steveStorage = { money: 0, gemShards: 0, scraps: 0 };
      }

      let earned = 0;

      if (worker.stored != 0) {
        earned += Math.floor(worker.stored * perItem);

        await prisma.economyWorker.update({
          where: {
            userId_workerId: {
              userId: worker.userId,
              workerId: worker.workerId,
            },
          },
          data: {
            stored: 0,
          },
        });
      }

      earned += Math.floor(incrementAmount * perItem);

      await updateBalance(worker.userId, (await getBalance(worker.userId)) + earned);
      await addProgress(worker.userId, "capitalist", earned);

      steveStorage.money += earned;

      while (percentChance(gemChance * incrementAmount)) {
        steveStorage.gemShards++;
        await addInventoryItem(worker.userId, "gem_shard", 1);
      }

      while (percentChance(scrapChance * incrementAmount)) {
        steveStorage.scraps++;
        await addInventoryItem(worker.userId, "quarry_scrap", 1);
      }

      await redis.set(
        `${Constants.redis.nypsi.STEVE_EARNED}:${worker.userId}`,
        JSON.stringify(steveStorage),
      );
      await redis.expire(
        `${Constants.redis.nypsi.STEVE_EARNED}:${worker.userId}`,
        ms("24 hours") / 1000,
      );
    } else {
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
  }

  let amount = 0;

  for (const userId of Array.from(dms.keys())) {
    const data: NotificationPayload = {
      memberId: userId,
      payload: {
        content: null,
        embed: null,
        components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("w-claim")
            .setLabel("claim")
            .setStyle(ButtonStyle.Success),
        ),
      },
    };

    const workers = await getWorkers(userId);

    const full: string[] = [];

    for (const worker of workers) {
      const { maxStorage } = await calcWorkerValues(worker);

      if (worker.stored >= maxStorage) full.push(worker.workerId);
    }

    try {
      if (full.length == workers.length) {
        data.payload.content = null;
        data.payload.embed = new CustomEmbed()
          .setDescription("all of your workers are full")
          .setColor(Constants.TRANSPARENT_EMBED_COLOR);
      } else if (full.length == 1 && (await getDmSettings(userId)).worker == "All") {
        data.payload.embed = new CustomEmbed()
          .setDescription(
            `your ${getBaseWorkers()[full[0]].item_emoji} ${
              getBaseWorkers()[full[0]].name
            } is full`,
          )
          .setColor(Constants.TRANSPARENT_EMBED_COLOR);
      } else if ((await getDmSettings(userId)).worker == "All") {
        data.payload.content = `${full.length} of your workers are full`;
        data.payload.embed = new CustomEmbed()
          .setDescription(
            full
              .map(
                (workerId) =>
                  `${getBaseWorkers()[workerId].item_emoji} ${getBaseWorkers()[workerId].name}`,
              )
              .join("\n"),
          )
          .setHeader("full workers:")
          .setColor(Constants.TRANSPARENT_EMBED_COLOR)
          .setFooter({ text: "/settings me notifications" });
      }

      if (!data.payload.embed) continue;

      await addNotificationToQueue(data);
      amount++;
    } catch {
      /* happy linter */
    }
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
