import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { NotificationPayload } from "../../types/Notification";
import { SteveData } from "../../types/Workers";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addBalance } from "../../utils/functions/economy/balance";
import { getBoosters } from "../../utils/functions/economy/boosters";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { addStat } from "../../utils/functions/economy/stats";
import { getBaseWorkers } from "../../utils/functions/economy/utils";
import {
  calcWorkerValues,
  evaluateWorker,
  getWorkers,
} from "../../utils/functions/economy/workers";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import ms = require("ms");

export default {
  name: "workers",
  cron: "0 * * * *",
  async run(log, manager) {
    const start = performance.now();
    const query = await prisma.economyWorker.findMany({
      include: {
        upgrades: true,
      },
    });

    const dms = new Set<string>();
    const hasSteve = new Set<string>();
    const baseWorkers = getBaseWorkers();

    for (const worker of query) {
      const { perItem, perInterval, maxStorage, byproductChances } = await calcWorkerValues(
        worker,
        manager,
      );

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
        } else {
          steveStorage = { money: 0, byproducts: {} };
        }

        const { amountEarned, byproductAmounts } = await evaluateWorker(
          manager,
          worker.userId,
          baseWorkers[worker.workerId],
          {
            stored: worker.stored + incrementAmount,
            calculated: {
              perItem: perItem,
              byproductChances: byproductChances,
            },
          },
        );

        if (worker.stored != 0) {
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

        steveStorage.money += amountEarned;

        await addBalance(worker.userId, amountEarned);
        await addProgress(worker.userId, "capitalist", amountEarned);
        await addProgress(worker.userId, "super_capitalist", amountEarned);
        await addStat(worker.userId, "earned-workers", amountEarned);

        for (const byproduct in byproductAmounts) {
          if (steveStorage.byproducts[byproduct] == undefined) {
            steveStorage.byproducts[byproduct] = 0;
          }
          steveStorage.byproducts[byproduct] += byproductAmounts[byproduct];
          await addInventoryItem(worker.userId, byproduct, byproductAmounts[byproduct]);
        }

        await redis.set(
          `${Constants.redis.nypsi.STEVE_EARNED}:${worker.userId}`,
          JSON.stringify(steveStorage),
          "EX",
          ms("24 hours") / 1000,
        );
      } else if (incrementAmount != 0) {
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
        const { maxStorage } = await calcWorkerValues(worker, manager);

        if (worker.stored >= maxStorage) full.push(worker.workerId);
      }

      try {
        if (full.length == workers.length) {
          data.payload.content = null;
          data.payload.embed = new CustomEmbed(userId).setDescription(
            "all of your workers are full",
          );
        } else if (full.length == 1 && (await getDmSettings(userId)).worker == "All") {
          data.payload.embed = new CustomEmbed(userId).setDescription(
            `your ${getBaseWorkers()[full[0]].item_emoji} ${getBaseWorkers()[full[0]].name} is full`,
          );
        } else if ((await getDmSettings(userId)).worker == "All") {
          data.payload.content = `${full.length} of your workers are full`;
          data.payload.embed = new CustomEmbed(userId)
            .setDescription(
              full
                .map(
                  (workerId) =>
                    `${getBaseWorkers()[workerId].item_emoji} ${getBaseWorkers()[workerId].name}`,
                )
                .join("\n"),
            )
            .setHeader("full workers:")
            .setFooter({ text: "/settings me notifications" });
        }

        if (!data.payload.embed) continue;

        addNotificationToQueue(data);
        amount++;
      } catch {
        /* happy linter */
      }
    }

    const end = performance.now();

    if (amount > 0) log(`${amount} worker notifications queued`);
    log(`time taken for workers: ${Math.floor(end - start) / 1000}s`);
  },
} satisfies Job;
