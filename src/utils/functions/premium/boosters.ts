import ms = require("ms");
import prisma from "../../../init/database";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { addNotificationToQueue } from "../users/notifications";
import { getPreferences } from "../users/preferences";
import { createProfile } from "../users/utils";

const boosterCache = new RedisCache<boolean>(
  Constants.redis.cache.premium.BOOSTER,
  ms("3 hours") / 1000,
);

export async function isBooster(member: MemberResolvable) {
  const userId = getUserId(member);

  const cached = await boosterCache.get(userId);
  if (cached !== null) return cached;

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

  await boosterCache.set(userId, query.booster);

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

  await boosterCache.delete(userId);

  if (value && (await getPreferences(member)).premium) {
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
