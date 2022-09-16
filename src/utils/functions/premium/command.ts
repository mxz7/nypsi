import prisma from "../../database/database";
import { isPremium } from "./premium";

type PremiumCommand = {
  owner: string;
  trigger: string;
  content: string;
  uses: number;
};

export async function getCommand(name: string): Promise<PremiumCommand> {
  const query = await prisma.premiumCommand.findUnique({
    where: {
      trigger: name,
    },
  });

  if (query) {
    if (!(await isPremium(query.owner))) {
      return undefined;
    }
    return query;
  } else {
    return undefined;
  }
}

export async function getUserCommand(id: string) {
  return await prisma.premiumCommand.findUnique({
    where: {
      owner: id,
    },
  });
}

export async function setCommand(id: string, trigger: string, content: string) {
  const query = await prisma.premiumCommand.findUnique({
    where: {
      owner: id,
    },
    select: {
      owner: true,
    },
  });

  if (query) {
    await prisma.premiumCommand.update({
      where: {
        owner: id,
      },
      data: {
        trigger: trigger,
        content: content,
        uses: 0,
      },
    });
  } else {
    await prisma.premiumCommand.create({
      data: {
        trigger: trigger,
        content: content,
        owner: id,
      },
    });
  }
}

export async function addUse(id: string) {
  await prisma.premiumCommand.update({
    where: {
      owner: id,
    },
    data: {
      uses: { increment: 1 },
    },
  });
}
