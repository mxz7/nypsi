import { PrismaClient } from "@prisma/client";
import Constants from "../src/utils/Constants";

const prisma = new PrismaClient()

async function main() {
  await prisma.user.upsert({
    where: { id: Constants.TEKOH_ID },
    update: {
      adminLevel: 69,
    },
    create: {
      id: Constants.TEKOH_ID,
      lastKnownUsername: "",  
      lastCommand: new Date(0),
      adminLevel: 69,
    },
  });

  await prisma.economy.upsert({
    where: { userId: Constants.TEKOH_ID },
    update: {
      lastVote: new Date(0),
      lastDaily: new Date(0),
    },
    create: {
      userId: Constants.TEKOH_ID,
      lastVote: new Date(0),
      lastDaily: new Date(0),
    },
  });
}

main().catch((err) => {
  console.error(err);
})