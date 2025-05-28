import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { DMQueue } from "../../types/Market";
import { NotificationPayload } from "../../types/Notification";
import Constants from "../../utils/Constants";
import { getItems } from "../../utils/functions/economy/utils";
import { addNotificationToQueue, getPreferences } from "../../utils/functions/users/notifications";
import { getLastKnownUsername } from "../../utils/functions/users/tag";

export default {
  name: "market dm",
  cron: "* * * * *",
  async run(log) {
    let count = 0;
    const sellKeys = await redis.hkeys(`${Constants.redis.nypsi.MARKET_DM}:sell`);

    for (const userId of sellKeys) {
      const marketDelay = await getPreferences(userId)
        .then((r) => r.marketDelay)
        .catch(() => 180);

      const data = await redis
        .hget(`${Constants.redis.nypsi.MARKET_DM}:sell`, userId)
        .then((r) => (r ? (JSON.parse(r) as DMQueue) : undefined));

      if (!data) {
        await redis.hdel(`${Constants.redis.nypsi.MARKET_DM}:sell`, userId);
        continue;
      }

      if (data.createdAt > Date.now() - marketDelay * 1000) {
        continue;
      }

      await redis.hdel(`${Constants.redis.nypsi.MARKET_DM}:sell`, userId);

      addNotificationToQueue(await createPayload(data, "sell"));
      count++;
    }

    const buyKeys = await redis.hkeys(`${Constants.redis.nypsi.MARKET_DM}:buy`);

    for (const userId of buyKeys) {
      const marketDelay = await getPreferences(userId)
        .then((r) => r.marketDelay)
        .catch(() => 180);

      const data = await redis
        .hget(`${Constants.redis.nypsi.MARKET_DM}:buy`, userId)
        .then((r) => (r ? (JSON.parse(r) as DMQueue) : undefined));

      if (!data) {
        await redis.hdel(`${Constants.redis.nypsi.MARKET_DM}:buy`, userId);
        continue;
      }

      if (data.createdAt > Date.now() - marketDelay * 1000) {
        continue;
      }

      await redis.hdel(`${Constants.redis.nypsi.MARKET_DM}:buy`, userId);

      addNotificationToQueue(await createPayload(data, "buy"));
      count++;
    }

    if (count > 0) {
      log(`queued ${count} market DMs`);
    }
  },
} satisfies Job;

async function createPayload(data: DMQueue, type: "buy" | "sell"): Promise<NotificationPayload> {
  let description = "";
  let total = 0;

  for (const item of Object.keys(data.items)) {
    const buyers = data.items[item];
    description += `- ${getItems()[item].emoji} **${getItems()[item].name}**:\n`;

    for (const buyer of Object.keys(buyers)) {
      const amount = buyers[buyer];
      const username = await getLastKnownUsername(buyer);
      description += `  - **${username}**: ${amount.toLocaleString()}\n`;
      total += amount;
    }

    description += "\n";
  }

  const embed = new CustomEmbed(data.userId).setDescription(description);

  if (type == "sell") embed.setFooter({ text: `+$${data.earned.toLocaleString()}` });

  return {
    memberId: data.userId,
    payload: {
      content: `${total.toLocaleString()}x of your ${type} order items have been fulfilled`,
      embed: embed,
    },
  };
}
