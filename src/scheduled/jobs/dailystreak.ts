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

  const calendarSaved: string[] = [];
  const gemSaved: string[] = [];
  const resetStreaks: string[] = [];

  for (const user of users) {
    if (user.Inventory.find((i) => i.item == "calendar")?.amount > 0) {
      if (user.user.DMSettings.other) calendarSaved.push(user.userId);

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
      continue;
    } else if (user.Inventory.find((i) => i.item == "white_gem")?.amount > 0) {
      const gemSaveChance = Math.floor(Math.random() * 10);

      if (gemSaveChance < 5) {
        gemSaved.push(user.userId);
        continue;
      }
    }

    if (user.user.DMSettings.other) resetStreaks.push(user.userId);

    await prisma.economy.update({
      where: {
        userId: user.userId,
      },
      data: {
        dailyStreak: 0,
      },
    });
  }

  const calendarSavedEmbed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setTitle("your daily streak has been saved by a calendar!")
    .setDescription(
      "calendars in your inventory protect your daily streak, make sure to do `/daily` to continue your streak"
    );

  const gemSavedEmbed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setTitle("your daily streak was saved by your white gem!")
    .setDescription(
      "<:nypsi_gem_white:1046933670436552725> white gems have a chance to protect your daily streak. make sure to do /daily to continue your streak"
    );

  const resetEmbed = new CustomEmbed()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setTitle("you have lost your daily streak!")
    .setDescription(
      "you have lost your daily streak by not doing `/daily`. calendars can be used to protect your daily streak from being reset"
    );

  for (const userId of calendarSaved) {
    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: calendarSavedEmbed,
      },
    });
  }

  for (const userId of gemSaved) {
    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: gemSavedEmbed,
      },
    });
  }

  for (const userId of resetStreaks) {
    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: resetEmbed,
      },
    });
  }

  if (calendarSaved.length > 0) parentPort.postMessage(`${calendarSaved.length} daily streaks saved by calendars`);
  if (gemSaved.length > 0) parentPort.postMessage(`${gemSaved.length} daily streaks saved by gems`);
  if (resetStreaks.length > 0) parentPort.postMessage(`${resetStreaks.length} daily streaks reset`);

  process.exit(0);
})();
