import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";

(async () => {
  const limit = dayjs().subtract(1, "day").subtract(2, "hours").toDate();

  const users = await prisma.economy.findMany({
    where: {
      AND: [{ lastDaily: { lte: limit } }, { dailyStreak: { gt: 1 } }],
    },
    select: {
      userId: true,
      user: {
        select: {
          DMSettings: {
            select: {
              other: true,
            },
          },
        },
      },
      Inventory: {
        where: {
          item: "calendar",
        },
      },
    },
  });

  const savedList: string[] = [];
  let savedCount = 0;
  const resetList: string[] = [];
  let resetCount = 0;

  for (const user of users) {
    if (user.Inventory.find((i) => i.item == "calendar").amount > 0) {
      if (user.user.DMSettings.other) savedList.push(user.userId);
      savedCount++;

      if (user.Inventory.find((i) => i.item == "calendar").amount == 1) {
        await prisma.inventory.delete({
          where: {
            userId_item: {
              userId: user.userId,
              item: "calendar",
            },
          },
        });
      } else {
        await prisma.inventory.update({
          where: {
            userId_item: {
              userId: user.userId,
              item: "calendar",
            },
          },
          data: {
            amount: { decrement: 1 },
          },
        });
      }
    } else {
      if (user.user.DMSettings.other) resetList.push(user.userId);
      resetCount++;

      await prisma.economy.update({
        where: {
          userId: user.userId,
        },
        data: {
          dailyStreak: 0,
        },
      });
    }
  }

  const savedEmbed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setTitle("your daily streak has been saved by a calendar!")
    .setDescription(
      "calendars in your inventory protect your daily streak, make sure to do `/daily` to continue your streak"
    );

  const resetEmbed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setTitle("you have lost your daily streak!")
    .setDescription(
      "you have lost your daily streak by not doing `/daily`. calendars can be used to protect your daily streak from being reset"
    );

  for (const userId of savedList) {
    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: savedEmbed,
      },
    });
  }

  for (const userId of resetList) {
    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: resetEmbed,
      },
    });
  }

  if (savedCount) parentPort.postMessage(`${savedCount} daily streaks saved by calendars`);
  if (resetCount) parentPort.postMessage(`${resetCount} daily streaks reset`);

  process.exit(0);
})();
