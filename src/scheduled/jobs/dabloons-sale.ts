import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { getDabloonsShop } from "../../utils/functions/economy/utils";

export default {
  name: "dabloons sale",
  cron: "0 0 * * *",
  run: async (log) => {
    const items = Object.values(getDabloonsShop());

    const item = items[Math.floor(Math.random() * items.length)];

    const saleOptions = [5, 10, 20];

    const sale = saleOptions[Math.floor(Math.random() * saleOptions.length)];

    await redis.set(
      Constants.redis.nypsi.DABLOONS_SALE,
      JSON.stringify({ itemId: item.itemId, sale }),
      "EX",
      86400, // 1 day
    );

    log(`${item.itemId} on sale for ${sale}% off`);
  },
} satisfies Job;
