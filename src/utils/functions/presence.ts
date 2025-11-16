import { ActivitiesOptions, ActivityType } from "discord.js";
import redis from "../../init/redis";
import Constants from "../Constants";
import { daysUntilChristmas } from "./date";
import { getTotalAmountOfItem } from "./economy/inventory";
import { getItems } from "./economy/utils";
import { pluralize } from "./string";

export async function randomPresence(): Promise<ActivitiesOptions> {
  const possibilities: ActivitiesOptions[] = [
    { name: "nypsi.xyz", type: ActivityType.Custom },
    { name: "nypsi.xyz", type: ActivityType.Custom },
    { name: "nypsi.xyz", type: ActivityType.Custom },
    { name: "nypsi.xyz", type: ActivityType.Custom },
    { name: "nypsi.xyz", type: ActivityType.Custom },
    { name: "nypsi.xyz", type: ActivityType.Custom },
    { name: "nypsi.xyz", type: ActivityType.Custom },
    { name: "xmas", type: ActivityType.Custom },
    {
      name: "nothing. me? just hanging around",
      type: ActivityType.Streaming,
      url: "https://www.youtube.com/watch?v=d2r_LU6beVw",
    },
    {
      name: "PUMPKIN",
      type: ActivityType.Streaming,
      url: "https://www.youtube.com/watch?v=QlKRD2bqTiQ",
    },
    {
      name: "item",
      type: ActivityType.Custom,
    },
  ];

  const chosen = possibilities[Math.floor(Math.random() * possibilities.length)];

  if (chosen.name === "xmas") {
    const days = daysUntilChristmas();

    if (days == "ITS CHRISTMAS") {
      chosen.name = "MERRY CHRISTMAS";
    } else {
      chosen.name = `${days} ${pluralize("day", parseInt(days))} until christmas`;
    }
  } else if (chosen.name === "item") {
    const items = Object.values(getItems());
    const item = items[Math.floor(Math.random() * items.length)];
    const count = await getTotalAmountOfItem(item.id);
    chosen.name = `${count.toLocaleString()} ${!item.emoji.includes("<") ? `${item.emoji} ` : ""}${pluralize(item, count)}`;
  }

  return chosen;
}

export async function getCustomPresence() {
  return await redis.get(Constants.redis.nypsi.PRESENCE);
}

export async function setCustomPresence(text?: string) {
  if (!text) return await redis.del(Constants.redis.nypsi.PRESENCE);
  await redis.set(Constants.redis.nypsi.PRESENCE, text);
}
