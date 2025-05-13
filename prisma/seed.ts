import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import { Item } from "../src/types/Economy";
import Redis from "ioredis";

const redis = new Redis({
  showFriendlyErrorStack: true,
});

const prisma = new PrismaClient()

const admins = ["672793821850894347", "499720078770831360", "223953495982735363"];

async function main() {
  const items: { [key: string]: Item } = JSON.parse(fs.readFileSync("./data/items.json") as any);
  
  const tradeableItems = Object.values(items).filter(item => !item.account_locked);

  // create user account for admins with all items of quantity 50
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
        karma: Math.floor(Math.random() * 5000),
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


    for (const item of tradeableItems) {
      await prisma.inventory.upsert({
        where: {
          userId_item: {
            userId: adminId,
            item: item.id,
          },
        },
        update: {
          amount: 50,
        },
        create: {
          userId: adminId,
          item: item.id,
          amount: 50,
        },
      });
    }
  }
  await redis.flushdb('ASYNC');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
})
