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

    const saleOptions = [
      0.01, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
      0.1, 0.2, 0.2, 0.2, 0.2, 0.4, 0.4, 0.5,
    ];

    const sale = saleOptions[Math.floor(Math.random() * saleOptions.length)];

    await redis.set(
      Constants.redis.nypsi.DABLOONS_SALE,
      JSON.stringify({ itemId: item.itemId, sale }),
      "EX",
      86400, // 1 day
    );

    log(`${item.itemId} on sale for ${Math.floor(sale * 100)}% off`);
  },
} satisfies Job;
