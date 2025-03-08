import dayjs = require("dayjs");
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { deletePlant } from "../../utils/functions/economy/farm";
import { getPlantsData } from "../../utils/functions/economy/utils";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";

export default {
  name: "plant health check",
  cron: "0 */8 * * *",
  async run(log) {
    const query = await prisma.farm.findMany({
      select: {
        userId: true,
        id: true,
        plantId: true,
        fertilisedAt: true,
        wateredAt: true,
      },
      where: {
        AND: [
          { economy: { user: { DMSettings: { farmHealth: true } } } },
          {
            OR: [
              { fertilisedAt: { lt: dayjs().subtract(1, "day").toDate() } },
              { wateredAt: { lt: dayjs().subtract(1, "day").toDate() } },
            ],
          },
        ],
      },
    });

    const grouped = new Map<
      string,
      {
        id: number;
        userId: string;
        plantId: string;
        wateredAt: Date;
        fertilisedAt: Date;
      }[]
    >();

    for (const plant of query) {
      if (!grouped.has(plant.userId)) {
        grouped.set(plant.userId, [plant]);
      } else {
        grouped.get(plant.userId).push(plant);
      }
    }

    let dms = 0;

    for (const [userId, plants] of grouped.entries()) {
      if (await redis.exists(`${Constants.redis.nypsi.FARM_STATUS_DM}:${userId}`)) continue;
      let needWater = 0;
      let needFertiliser = 0;
      let dead = 0;

      for (const plant of plants) {
        if (
          plant.fertilisedAt.valueOf() <
            dayjs()
              .subtract(getPlantsData()[plant.plantId].fertilise.dead, "seconds")
              .toDate()
              .valueOf() ||
          plant.wateredAt.valueOf() <
            dayjs()
              .subtract(getPlantsData()[plant.plantId].water.dead, "seconds")
              .toDate()
              .valueOf()
        ) {
          dead++;
          deletePlant(plant.id);
        } else if (
          plant.fertilisedAt.valueOf() <
          dayjs()
            .subtract(getPlantsData()[plant.plantId].fertilise.every * 1.5, "seconds")
            .toDate()
            .valueOf()
        ) {
          needFertiliser++;
        } else if (
          plant.wateredAt.valueOf() <
          dayjs()
            .subtract(getPlantsData()[plant.plantId].water.every * 1.5, "seconds")
            .toDate()
            .valueOf()
        ) {
          needWater++;
        }
      }

      if (needWater > 0 || needFertiliser > 0 || dead > 0) {
        await redis.set(`${Constants.redis.nypsi.FARM_STATUS_DM}:${userId}`, "t", "EX", 86400);
        const embed = new CustomEmbed(userId).setDescription(
          (dead > 0 ? `**${dead}** of your plants have died` : "") +
            (needWater > 0 ? `\n**${needWater}** of your plants need water` : "") +
            (needFertiliser > 0 ? `\n**${needFertiliser}** of your plants need fertiliser` : ""),
        );

        dms++;

        addNotificationToQueue({
          memberId: userId,
          payload: { embed, content: "you have unhealthy plants!" },
        });
      }
    }

    log(`${dms} dms enqueued`);
  },
} satisfies Job;
