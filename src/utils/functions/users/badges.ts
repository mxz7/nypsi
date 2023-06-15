import prisma from "../../../init/database";

export async function getBadges(userId: string) {
  return await prisma.user
    .findUnique({ where: { id: userId }, select: { badges: true } })
    .then((r) => r.badges);
}

export async function setBadges(userId: string, badges: string[]) {
  return await prisma.user
    .update({
      where: { id: userId },
      data: { badges },
      select: {
        badges: true,
      },
    })
    .then((r) => r.badges);
}
