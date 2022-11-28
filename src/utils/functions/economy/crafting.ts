import dayjs = require("dayjs");
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { addProgress } from "./achievements";
import { addInventoryItem } from "./inventory";
import { getItems } from "./utils";

export async function getCraftingItems(member: GuildMember | string, deleteOld = true) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.crafting.findMany({
    where: {
      userId: id,
    },
    select: {
      amount: true,
      itemId: true,
      finished: true,
      id: true,
    },
  });

  const completed: { itemId: string; amount: number; finished: Date }[] = [];

  if (deleteOld) {
    for (const item of query) {
      if (item.finished.getTime() < Date.now()) {
        completed.push(item);
        query.splice(query.indexOf(item), 1);

        await prisma.crafting.delete({
          where: {
            id: item.id,
          },
        });

        await addInventoryItem(id, item.itemId, item.amount);
      }
    }
  }

  if (completed.length > 0) {
    await addProgress(id, "crafter", completed.length);
  }

  return { current: query, completed };
}

export async function newCraftItem(member: GuildMember | string, itemId: string, amount: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const time = getItems()[itemId].craft.time * amount;

  return await prisma.crafting.create({
    data: {
      userId: id,
      itemId: itemId,
      amount: amount,
      finished: dayjs().add(time, "seconds").toDate(),
    },
  });
}
