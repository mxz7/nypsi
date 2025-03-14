import dayjs = require("dayjs");
import { WebhookClient } from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { isEcoBanned, setEcoBan } from "../../utils/functions/economy/utils";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import { getLastKnownUsername } from "../../utils/functions/users/tag";
import { getTimestamp } from "../../utils/logger";

export default {
  name: "captcha ban",
  cron: "0 0 * * *",
  async run(log) {
    const query = await prisma.captcha.findMany({
      where: {
        AND: [{ solved: false }, { createdAt: { lt: dayjs().subtract(1, "day").toDate() } }],
      },
    });

    const hook = new WebhookClient({
      url: process.env.ANTICHEAT_HOOK,
    });

    for (const captcha of query) {
      await prisma.captcha.update({
        where: {
          id: captcha.id,
        },
        data: {
          solved: true,
        },
      });

      if (!(await isEcoBanned(captcha.userId)).banned) {
        setEcoBan(captcha.userId, dayjs().add(7, "day").toDate());
        addNotificationToQueue({
          memberId: captcha.userId,
          payload: {
            content:
              "you have been banned from nypsi economy for 7 days for failing to complete a captcha",
          },
        });

        redis.del(`${Constants.redis.nypsi.LOCKED_OUT}:${captcha.userId}`);

        await hook.send(
          `[${getTimestamp()}] **${await getLastKnownUsername(captcha.userId)}** (${
            captcha.userId
          }) has been banned for 7 days for failing to complete a captcha`,
        );
      }
    }

    log(`${query.length} users autobanned for failing to complete a captcha`);
    hook.destroy();
  },
} satisfies Job;
