import ms = require("ms");
import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";

(async () => {
  const now = Date.now();

  const threshold = now - ms("7 hours");

  const users = await prisma.user.findMany({
    where: {
      karma: { gt: 1 },
    },
    select: {
      id: true,
      karma: true,
      lastCommand: true,
      DMSettings: {
        select: {
          other: true,
        },
      },
      Economy: {
        select: {
          Inventory: {
            where: {
              item: { contains: "gem" },
            },
          },
        },
      },
    },
  });

  let total = 0;

  for (const user of users) {
    let karmaToRemove = 2;

    if (user.lastCommand.getTime() > threshold) karmaToRemove = 0;

    if (now - ms("2 days") > user.lastCommand.getTime()) {
      karmaToRemove += 7;
    }

    if (now - ms("1 week") > user.lastCommand.getTime()) {
      karmaToRemove += 10;
    }

    if (now - ms("30 days") > user.lastCommand.getTime()) {
      karmaToRemove += 50;
    }

    if (now - ms("90 days") > user.lastCommand.getTime()) {
      karmaToRemove += 69420;
    }

    if (user.karma > 1000) {
      karmaToRemove += user.karma * 0.05;
    }

    if (user.karma > 10_000) {
      karmaToRemove += user.karma * 0.2;
    }

    if (karmaToRemove > user.karma) {
      karmaToRemove = user.karma - 1;
    }

    if (user?.Economy?.Inventory.find((i) => i.item == "white_gem")?.amount > 0 && user.DMSettings?.other) {
      const chance = Math.floor(Math.random() * 10);

      if (chance < 5) {
        await addNotificationToQueue({
          memberId: user.id,
          payload: {
            embed: new CustomEmbed()
              .setHeader("karma")
              .setDescription(
                "your <:nypsi_gem_white:1046933670436552725> white gem has saved your karma from being deteriorated\n" +
                  `you would have lost **${karmaToRemove}** karma`
              )
              .setColor(Constants.TRANSPARENT_EMBED_COLOR),
          },
        });
        continue;
      }
    } else if (user?.Economy?.Inventory.find((i) => i.item == "pink_gem")?.amount > 0 && user.DMSettings?.other) {
      const chance = Math.floor(Math.random() * 13);

      if (chance < 2) {
        await addNotificationToQueue({
          memberId: user.id,
          payload: {
            embed: new CustomEmbed()
              .setHeader("karma")
              .setDescription(
                "your <:nypsi_gem_pink:1046932847069499472> pink gem has saved your karma from being deteriorated\n" +
                  `you would have lost **${karmaToRemove}** karma`
              )
              .setColor(Constants.TRANSPARENT_EMBED_COLOR),
          },
        });
        continue;
      }
    }

    total += Math.floor(karmaToRemove);

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        karma: { decrement: Math.floor(karmaToRemove) },
      },
    });

    await redis.del(`${Constants.redis.cache.user.KARMA}:${user.id}`);
  }

  parentPort.postMessage(`${total} total karma deteriorated`);
  process.exit(0);
})();
