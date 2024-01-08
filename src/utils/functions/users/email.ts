import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addInventoryItem } from "../economy/inventory";
import { getItems, setEcoBan } from "../economy/utils";
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
import { hasProfile } from "./utils";

export async function getEmail(id: string) {
  const query = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      email: true,
    },
  });

  return query.email;
}

export async function setEmail(id: string, email: string) {
  logger.info(`${email} assigned to ${id}`);

  return await prisma.user.update({
    where: {
      id,
    },
    data: {
      email,
    },
  });
}

export async function checkPurchases(id: string, client: NypsiClient) {
  const email = await getEmail(id);

  if (!email) return;

  const query = await prisma.kofiPurchases.findMany({
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
    logger.info(`giving purchased item to ${id}`, item);

    if (item.item.startsWith("donation-")) {
      await prisma.user.update({
        where: {
          id,
        },
        data: {
          totalSpend: { increment: parseFloat(item.item.split("-")[1] || "0") },
        },
      });

      if ((await getDmSettings(id)).premium) {
        const payload: NotificationPayload = {
          memberId: id,
          payload: {
            content: "thank you for your donation",
            embed: new CustomEmbed()
              .setDescription(
                `thank you very much for your donation of ${Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(parseFloat(item.item.split("-")[1] || "0"))}`,
              )
              .setColor(Constants.TRANSPARENT_EMBED_COLOR),
          },
        };

        await addNotificationToQueue(payload);
      }
    } else {
      await prisma.user.update({
        where: {
          id,
        },
        data: {
          totalSpend: {
            increment:
              Array.from(Constants.KOFI_PRODUCTS.values()).find((i) => i.name === item.item)
                ?.cost || 0,
          },
        },
      });

      if (premiums.includes(item.item)) {
        if (await isPremium(id)) {
          if (levelString(await getTier(id)).toLowerCase() != item.item) {
            await setTier(id, premiums.indexOf(item.item) + 1, client);
            await setCredits(id, 0);
            await renewUser(id, client);
          } else {
            await renewUser(id, client);
          }
        } else {
          await addMember(id, premiums.indexOf(item.item) + 1);
        }
      } else {
        if (item.item === "unecoban") {
          await setEcoBan(id);

          if ((await getDmSettings(id)).premium) {
            const payload: NotificationPayload = {
              memberId: id,
              payload: {
                content: "thank you for your purchase",
                embed: new CustomEmbed()
                  .setDescription(`you have been **unbanned**`)
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            };

            await addNotificationToQueue(payload);
          }
        } else {
          await addInventoryItem(id, item.item, 1);

          if ((await getDmSettings(id)).premium) {
            const payload: NotificationPayload = {
              memberId: id,
              payload: {
                content: "thank you for your purchase",
                embed: new CustomEmbed()
                  .setDescription(
                    `you have received 1 ${getItems()[item.item].emoji} ${
                      getItems()[item.item].name
                    }`,
                  )
                  .setColor(Constants.TRANSPARENT_EMBED_COLOR),
              },
            };

            await addNotificationToQueue(payload);
          }
        }
      }
    }
  }

  await prisma.kofiPurchases.updateMany({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    data: {
      email: null,
      userId: id,
    },
  });
}

export async function getTotalSpend(userId: string) {
  if (!(await hasProfile(userId))) return 0;

  const query = await prisma.user.findUnique({
    where: { id: userId },
    select: { totalSpend: true },
  });

  return query.totalSpend;
}
