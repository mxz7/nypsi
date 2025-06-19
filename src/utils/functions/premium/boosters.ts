import ms = require("ms");
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { createProfile } from "../users/utils";

export async function isBooster(member: MemberResolvable) {
  const userId = getUserId(member);

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

  await redis.set(
    `${Constants.redis.cache.premium.BOOSTER}:${userId}`,
    query.booster ? "t" : "f",
    "EX",
    ms("3 hours") / 1000,
  );

  return query.booster;
}

export async function setBooster(member: MemberResolvable, value: boolean): Promise<void> {
  const userId = getUserId(member);
  let fail = false;

  await prisma.user
    .update({
      where: {
        id: getUserId(member),
      },
      data: {
        booster: value,
      },
    })
    .catch(() => {
      fail = true;
    });

  if (fail) {
    await createProfile(member);
    return setBooster(member, value);
  }

  await redis.del(`${Constants.redis.cache.premium.BOOSTER}:${userId}`);

  if (value && (await getDmSettings(member)).premium) {
    addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed(
          null,
          `thank you for boosting the nypsi server, you can see your rewards [here](${Constants.BOOST_REWARDS_LINK})`,
        )
          .setColor(Constants.EMBED_SUCCESS_COLOR)
          .setHeader("thank you for supporting nypsi!!"),
      },
    });
  }
}
