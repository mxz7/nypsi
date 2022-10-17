import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { addInventoryItem } from "../economy/inventory";
import { addMember, getPremiumProfile, isPremium, renewUser, setTier } from "../premium/premium";

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
