import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger/logger";
import { addInventoryItem } from "../economy/inventory";
import { getItems } from "../economy/utils";
import { addMember, getPremiumProfile, isPremium, renewUser, setTier } from "../premium/premium";
import { addNotificationToQueue, getDmSettings } from "./notifications";

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
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });

  const premiums = ["platinum", "gold", "silver", "bronze"].reverse();

  for (const item of query) {
    logger.info(`giving purchased item to ${id}`, item);

    if (premiums.includes(item.item)) {
      if (await isPremium(id)) {
        if ((await getPremiumProfile(id)).getLevelString().toLowerCase() != item.item) {
          await setTier(id, premiums.indexOf(item.item) + 1, client);
          await renewUser(id, client);
        } else {
          await renewUser(id, client);
        }
      } else {
        await addMember(id, premiums.indexOf(item.item) + 1, client);
      }
    } else {
      await addInventoryItem(id, item.item, 1, false);

      if ((await getDmSettings(id)).premium) {
        const payload: NotificationPayload = {
          memberId: id,
          payload: {
            content: "thank you for your purchase",
            embed: new CustomEmbed()
              .setDescription(`you have received 1 ${getItems()[item.item].emoji} ${getItems()[item.item].name}`)
              .setColor(Constants.TRANSPARENT_EMBED_COLOR),
          },
        };

        await addNotificationToQueue(payload);
      }
    }
  }

  await prisma.kofiPurchases.deleteMany({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });
}
