import dayjs = require("dayjs");
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems } from "../../utils/functions/economy/utils";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";

async function checkCraftItems() {
  const query = await prisma.crafting.findMany({
    where: {
      finished: { lt: new Date() },
    },
  });

  for (const item of query) {
    await prisma.crafting.delete({
      where: {
        id: item.id,
      },
    });

    await addInventoryItem(item.userId, item.itemId, item.amount);

    await addProgress(item.userId, "crafter", item.amount);
    if (item.itemId.includes("_gem") || item.itemId === "crystal_heart")
      await addProgress(item.userId, "gem_hunter", item.amount);

    if ((await getDmSettings(item.userId)).other) {
      addNotificationToQueue({
        memberId: item.userId,
        payload: {
          content: `you have finished crafting ${item.amount} ${getItems()[item.itemId].emoji} ${
            getItems()[item.itemId].name
          }`,
          embed: new CustomEmbed()
            .setDescription(
              `\`${item.amount}x\` ${getItems()[item.itemId].emoji} ${
                getItems()[item.itemId].name
              }`,
            )
            .setColor(Constants.TRANSPARENT_EMBED_COLOR),
        },
      });
    }
  }
}

export function runCraftItemsJob() {
  const onHour = dayjs().add(1, "hour").set("minutes", 0).set("seconds", 0);

  const needed = onHour.toDate().getTime() - Date.now();

  setInterval(checkCraftItems, needed);
}
