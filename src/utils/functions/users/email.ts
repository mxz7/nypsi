import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addInventoryItem } from "../economy/inventory";
import { getItems, setEcoBan } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";
import {
  addMember,
  getTier,
  isPremium,
  levelString,
  renewUser,
  setCredits,
  setTier,
} from "../premium/premium";
import { addNotificationToQueue, getDmSettings } from "./notifications";

export async function getEmail(member: MemberResolvable) {
  const query = await prisma.user.findUnique({
    where: {
      id: getUserId(member),
    },
    select: {
      email: true,
    },
  });

  return query.email;
}

export async function setEmail(member: MemberResolvable, email: string) {
  const userId = getUserId(member);

  logger.info(`${email} assigned to ${userId}`);

  return await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      email,
    },
  });
}

export async function checkPurchases(member: MemberResolvable) {
  const userId = getUserId(member);
  const email = await getEmail(member);

  if (!email) return;

  const query = await prisma.purchases.findMany({
    where: {
      AND: [
        {
          email: {
            equals: email,
            mode: "insensitive",
          },
        },
        { userId: null },
      ],
    },
  });

  const premiums = ["platinum", "gold", "silver", "bronze"].reverse();

  for (const item of query) {
    logger.info(`giving purchased item to ${userId}`, item);

    if (item.item === "donation") {
      if ((await getDmSettings(userId)).premium) {
        const payload: NotificationPayload = {
          memberId: userId,
          payload: {
            content: "thank you for your donation",
            embed: new CustomEmbed(userId).setDescription(
              `thank you very much for your donation of ${Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
              }).format(item.cost.toNumber())}`,
            ),
          },
        };

        addNotificationToQueue(payload);
      }
    } else {
      if (premiums.includes(item.item)) {
        if (await isPremium(userId)) {
          if (levelString(await getTier(userId)).toLowerCase() != item.item) {
            await setTier(userId, premiums.indexOf(item.item) + 1);
            await setCredits(userId, 0);
            await renewUser(userId);
          } else {
            await renewUser(userId);
          }
        } else {
          await addMember(userId, premiums.indexOf(item.item) + 1);
        }
      } else {
        if (item.item === "unecoban") {
          await setEcoBan(userId);

          if ((await getDmSettings(userId)).premium) {
            const payload: NotificationPayload = {
              memberId: userId,
              payload: {
                content: "thank you for your purchase",
                embed: new CustomEmbed(userId).setDescription(`you have been **unbanned**`),
              },
            };

            addNotificationToQueue(payload);
          }
        } else {
          await addInventoryItem(userId, item.item, item.amount || 1);

          if ((await getDmSettings(userId)).premium) {
            const payload: NotificationPayload = {
              memberId: userId,
              payload: {
                content: "thank you for your purchase",
                embed: new CustomEmbed(userId).setDescription(
                  `you have received ${item.amount}x ${getItems()[item.item].emoji} ${
                    getItems()[item.item].name
                  }`,
                ),
              },
            };

            addNotificationToQueue(payload);
          }
        }
      }
    }
  }

  await prisma.purchases.updateMany({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    data: {
      userId,
    },
  });

  await redis.del(`${Constants.redis.cache.premium.TOTAL_SPEND}:${userId}`);
}

export async function getTotalSpend(member: MemberResolvable) {
  const userId = getUserId(member);
  const cache = await redis.get(`${Constants.redis.cache.premium.TOTAL_SPEND}:${userId}`);

  if (cache) {
    return parseFloat(cache);
  }

  const query = await prisma.purchases.aggregate({
    where: {
      userId,
    },
    _sum: {
      cost: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.premium.TOTAL_SPEND}:${userId}`,
    query._sum.cost?.toNumber() || 0,
    "EX",
    3600,
  );

  return query._sum.cost?.toNumber() || 0;
}
