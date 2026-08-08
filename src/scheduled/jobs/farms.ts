import prisma from "../../init/database";
import redis from "../../init/redis";
import { JeremyData } from "../../types/Economy";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { getBoosters } from "../../utils/functions/economy/boosters";
import { getClaimable, getFarm, waterFarm } from "../../utils/functions/economy/farm";
import { getPlantsData } from "../../utils/functions/economy/utils";
import ms = require("ms");

export default {
  name: "farms",
  cron: "0 * * * *",
  async run(log, manager) {
    const start = performance.now();
    const users = await prisma.farm.findMany({
      distinct: ["userId"],
      select: { userId: true },
    });

    let active = 0;
    let harvested = 0;
    let watered = 0;

    for (const { userId } of users) {
      const boosters = await getBoosters(userId);
      if (!boosters.has("jeremy")) continue;

      active++;
      watered += (await waterFarm(userId)).count;

      const plantIds = new Set((await getFarm(userId)).map((plant) => plant.plantId));
      let storage: JeremyData = JSON.parse(
        await redis.get(`${Constants.redis.nypsi.JEREMY_EARNED}:${userId}`),
      );

      if (!storage) storage = { harvested: {} };

      for (const plantId of plantIds) {
        const result = await getClaimable(userId, plantId, true, manager);
        if (!Number.isFinite(result.sold) || result.sold <= 0) continue;

        const itemId = getPlantsData()[plantId].item;
        storage.harvested[itemId] = (storage.harvested[itemId] || 0) + result.sold;
        harvested += result.sold;
      }

      await redis.set(
        `${Constants.redis.nypsi.JEREMY_EARNED}:${userId}`,
        JSON.stringify(storage),
        "EX",
        ms("24 hours") / 1000,
      );
    }

    log(`${active} active, ${watered} plants watered, ${harvested} items harvested`);
    log(`time taken for farms: ${Math.floor(performance.now() - start) / 1000}s`);
  },
} satisfies Job;
