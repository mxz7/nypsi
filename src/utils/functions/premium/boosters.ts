import ms = require("ms");
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { createProfile } from "../users/utils";

export async function isBooster(userId: string) {
  if (await redis.exists(`${Constants.redis.cache.premium.BOOSTER}:${userId}`)) {
    return (await redis.get(`${Constants.redis.cache.premium.BOOSTER}:${userId}`)) === "t";
  }

  const query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      booster: true,
    },
  });

  if (!query) {
    return false;
  }

  await redis.set(`${Constants.redis.cache.premium.BOOSTER}:${userId}`, query.booster ? "t" : "f");
  await redis.expire(
    `${Constants.redis.cache.premium.BOOSTER}:${userId}`,
    Math.floor(ms("3 hours") / 1000),
  );

  return query.booster;
}

export async function setBooster(userId: string, value: boolean): Promise<void> {
  let fail = false;

  await prisma.user
    .update({
      where: {
        id: userId,
      },
      data: {
        booster: value,
      },
    })
    .catch(() => {
      fail = true;
    });

  if (fail) {
    await createProfile(userId);
    return setBooster(userId, value);
  }

  await redis.del(`${Constants.redis.cache.premium.BOOSTER}:${userId}`);

  if (value && (await getDmSettings(userId)).premium) {
    addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed(
          null,
          "thank you for boosting the nypsi server, you can see your rewards [here](https://discord.com/channels/747056029795221513/1031950370206924903/1092078265948188842)",
        )
          .setColor(Constants.EMBED_SUCCESS_COLOR)
          .setHeader("thank you for supporting nypsi!!"),
      },
    });
  }
}
