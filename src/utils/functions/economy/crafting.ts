import dayjs = require("dayjs");
import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
import { addProgress } from "./achievements";
import { addInventoryItem, isGem } from "./inventory";
import { getItems } from "./utils";

export async function getCraftingItems(member: MemberResolvable, deleteOld = true) {
  const userId = getUserId(member);

  const query = await prisma.crafting.findMany({
    where: {
      userId,
    },
    select: {
      amount: true,
      itemId: true,
      finished: true,
      id: true,
    },
  });

  const current = [...query];
  const completed: { itemId: string; amount: number; finished: Date }[] = [];

  if (deleteOld) {
    for (const item of query) {
      if (item.finished.getTime() < Date.now()) {
        completed.push(item);
        current.splice(
          current.findIndex((i) => i.id === item.id),
          1,
        );

        await prisma.crafting.delete({
          where: {
            id: item.id,
          },
        });

        await addInventoryItem(userId, item.itemId, item.amount);
        if (isGem(item.itemId)) await addProgress(userId, "gem_hunter", item.amount);
      }
    }
  }

  if (completed.length > 0) {
    addProgress(
      userId,
      "crafter",
      completed.map((i) => i.amount).reduce((a, b) => a + b),
    );
  }

  return { current, completed };
}

export async function newCraftItem(member: MemberResolvable, itemId: string, amount: number) {
  const time = getItems()[itemId].craft.time * amount;

  return await prisma.crafting.create({
    data: {
      userId: getUserId(member),
      itemId: itemId,
      amount: amount,
      finished: dayjs().add(time, "seconds").toDate(),
    },
  });
}
