import { PrismaClient } from "@prisma/client";
import { sampleSize } from 'lodash';
import * as fs from "fs";
import { Item } from "../src/types/Economy";

const prisma = new PrismaClient()

const admins = ["672793821850894347", "499720078770831360"];

async function main() {
  const items: { [key: string]: Item } = JSON.parse(fs.readFileSync("./data/items.json") as any);
  
  const tradeableItems = Object.values(items).filter(item => !item.account_locked);

  // create user account for admins with 50 random items with 1-100 quantity
  for (const adminId of admins) {
    await prisma.user.upsert({
      where: { id: adminId },
      update: {
        adminLevel: 69,
      },
      create: {
        id: adminId,
        lastKnownUsername: "",  
        lastCommand: new Date(0),
        adminLevel: 69,
      },
    });

    await prisma.economy.upsert({
      where: { userId: adminId },
      update: {
        lastVote: new Date(0),
        lastDaily: new Date(0),
      },
      create: {
        userId: adminId,
        lastVote: new Date(0),
        lastDaily: new Date(0),
        money: 1_000_000 + Math.floor(Math.random() * 1_000_000_000),
        xp: Math.floor(Math.random() * 25000),
        level: 10 + Math.floor(Math.random() * 1000),
      },
    });

    const randomItems = sampleSize(
      Array.from({ length: tradeableItems.length }, (_, i) => i),
      50
    );

    for (const index of randomItems) {
      const randomItem = tradeableItems[index];
      const amount = 1 + Math.floor(Math.random() * 100);
      
      await prisma.inventory.upsert({
        where: {
          userId_item: {
            userId: adminId,
            item: randomItem.id,
          },
        },
        update: {
          amount: amount,
        },
        create: {
          userId: adminId,
          item: randomItem.id,
          amount: amount,
        },
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
})
