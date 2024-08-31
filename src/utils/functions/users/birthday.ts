import prisma from "../../../init/database";

export async function getBirthday(userId: string) {
  const query = await prisma.user.findUnique({ where: { id: userId }, select: { birthday: true } });

  return query.birthday;
}

export async function setBirthday(userId: string, birthday: Date) {
  await prisma.user.update({ where: { id: userId }, data: { birthday } });
}

export async function isBirthdayEnabled(userId: string) {
  const query = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthdayAnnounce: true },
  });

  return query.birthdayAnnounce;
}

export async function setBirthdayEnabled(userId: string, enabled: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { birthdayAnnounce: enabled } });
}
