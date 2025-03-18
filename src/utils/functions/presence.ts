import { ActivitiesOptions, ActivityType } from "discord.js";
import redis from "../../init/redis";
import Constants from "../Constants";
import { daysUntilChristmas } from "./date";
import { getTotalAmountOfItem } from "./economy/inventory";
import { getItems } from "./economy/utils";

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
    { name: "with your mother", type: ActivityType.Playing },
    {
      name: "nothing. me? just hanging around",
      type: ActivityType.Streaming,
      url: "https://www.youtube.com/watch?v=d2r_LU6beVw",
    },
    {
      name: "ronnie pickering",
      type: ActivityType.Streaming,
      url: "https://youtube.com/watch?v=r0dcv6GKNNw&t=102s",
    },
    {
      name: "this",
      type: ActivityType.Streaming,
      url: "https://www.youtube.com/watch?v=7fMrijCFVdE",
    },
    {
      name: "item",
      type: ActivityType.Watching,
    },
  ];

  const chosen = possibilities[Math.floor(Math.random() * possibilities.length)];

  if (chosen.name === "xmas") {
    const days = daysUntilChristmas();

    if (days == "ITS CHRISTMAS") {
      chosen.name = "MERRY CHRISTMAS";
    } else {
      chosen.name = `${days} day${parseInt(days) > 1 ? "s" : ""} until christmas`;
    }
  } else if (chosen.name === "item") {
    const items = Object.values(getItems());
    const item = items[Math.floor(Math.random() * items.length)];
    const count = await getTotalAmountOfItem(item.id);
    chosen.name = `${count.toLocaleString()} ${!item.emoji.includes("<") ? `${item.emoji} ` : ""}${count !== 1 ? (item.plural ? item.plural : item.name + "s") : item.name}`;
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
