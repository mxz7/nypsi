import dayjs = require("dayjs");
import { inPlaceSort } from "fast-sort";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { getItems } from "../../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import ms = require("ms");

async function autosellThing() {
  const users = await redis.lrange(Constants.redis.nypsi.AUTO_SELL_ITEMS_MEMBERS, 0, -1);
  await redis.del(Constants.redis.nypsi.AUTO_SELL_ITEMS_MEMBERS);

  for (const user of users) {
    if (!(await getDmSettings(user)).autosellStatus) continue;
    const items = await redis.hgetall(`${Constants.redis.nypsi.AUTO_SELL_ITEMS}:${user}`);
    await redis.del(`${Constants.redis.nypsi.AUTO_SELL_ITEMS}:${user}`);

    const amounts = new Map<string, number>();
    const moneys = new Map<string, number>();
    let cheese = 0;
    const itemIds: string[] = [];

    for (const [k, v] of Object.entries(items)) {
      if (k === "cheese") {
        cheese += parseInt(v);
      } else {
        if (!itemIds.includes(k.split("-")[0])) itemIds.push(k.split("-")[0]);
        if (k.split("-")[1] === "amount") {
          amounts.set(k.split("-")[0], parseInt(v));
        } else {
          moneys.set(k.split("-")[0], parseInt(v));
        }
      }
    }

    const msg: string[] = [];

    msg.push(
      `+$**${Array.from(moneys.values())
        .reduce((a, b) => a + b)
        .toLocaleString()}**`,
    );

    inPlaceSort(itemIds).desc((i) => moneys.get(i));

    let remaining = 0;

    for (const item of itemIds) {
      if (msg.length > 10) {
        remaining += amounts.get(item);
        continue;
      }
      msg.push(
        `\`${amounts.get(item).toLocaleString()}x\` ${getItems()[item].emoji} ${
          getItems()[item].name
        } ($${moneys.get(item).toLocaleString()})`,
      );
    }

    if (remaining > 0) {
      msg.push(`${remaining.toLocaleString()} more items sold`);
    }

    if (cheese > 0) {
      msg.push(`\nyou found **${cheese.toLocaleString()}** 🧀 lucky cheese`);
    }

    addNotificationToQueue({
      memberId: user,
      payload: {
        embed: new CustomEmbed(null, msg.join("\n"))
          .setColor(Constants.TRANSPARENT_EMBED_COLOR)
          .setHeader("autosell"),
      },
    });
  }
}

export function doAutosellSitrep() {
  const start = dayjs().add(1, "hour").set("seconds", 0).set("minutes", 0).toDate().getTime();

  setTimeout(() => {
    autosellThing();
    setInterval(autosellThing, ms("1 hour"));
  }, start - Date.now());
}
