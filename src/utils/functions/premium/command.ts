import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
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

export async function getUserCommand(member: MemberResolvable) {
  return await prisma.premiumCommand.findUnique({
    where: {
      owner: getUserId(member),
    },
  });
}

export async function setCommand(member: MemberResolvable, trigger: string, content: string) {
  const userId = getUserId(member);

  await prisma.premiumCommand.upsert({
    where: {
      owner: userId,
    },
    update: {
      trigger: trigger,
      content: content,
      uses: 0,
    },
    create: {
      trigger: trigger,
      content: content,
      owner: userId,
    },
  });
}

export async function addUse(member: MemberResolvable) {
  await prisma.premiumCommand.update({
    where: {
      owner: getUserId(member),
    },
    data: {
      uses: { increment: 1 },
    },
  });
}
