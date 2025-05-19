import dayjs = require("dayjs");
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

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

export async function getTodaysBirthdays(useCache = true) {
  if (useCache) {
    const cache = await redis.get(Constants.redis.cache.BIRTHDAYS);

    if (cache) {
      return JSON.parse(cache) as { id: string; birthday: Date }[];
    }
  }

  const birthdayMembers: { id: string; birthday: Date }[] =
    await prisma.$queryRaw`SELECT id, birthday FROM "User"
  WHERE date_part('day', birthday) = date_part('day', CURRENT_DATE)
  AND date_part('month', birthday) = date_part('month', CURRENT_DATE)`;

  const ttl = dayjs().diff(
    dayjs().add(1, "day").set("hour", 0).set("minute", 0).set("second", 0).set("millisecond", 0),
    "second",
  );

  console.log(ttl);

  if (ttl > 0) await redis.set(Constants.redis.cache.BIRTHDAYS, JSON.stringify(birthdayMembers), "EX", ttl);

  return birthdayMembers;
}
