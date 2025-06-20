import dayjs = require("dayjs");
import { sort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";

export async function getBirthday(member: MemberResolvable) {
  const query = await prisma.user.findUnique({
    where: { id: getUserId(member) },
    select: { birthday: true },
  });

  return query.birthday;
}

export async function setBirthday(member: MemberResolvable, birthday: Date) {
  await prisma.user.update({ where: { id: getUserId(member) }, data: { birthday } });
}

export async function isBirthdayEnabled(member: MemberResolvable) {
  const query = await prisma.user.findUnique({
    where: { id: getUserId(member) },
    select: { birthdayAnnounce: true },
  });

  return query.birthdayAnnounce;
}

export async function setBirthdayEnabled(member: MemberResolvable, enabled: boolean) {
  await prisma.user.update({
    where: { id: getUserId(member) },
    data: { birthdayAnnounce: enabled },
  });
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

  const ttl = dayjs()
    .add(1, "day")
    .set("hour", 0)
    .set("minute", 0)
    .set("second", 0)
    .set("millisecond", 0)
    .diff(dayjs(), "second");

  if (ttl > 0)
    await redis.set(Constants.redis.cache.BIRTHDAYS, JSON.stringify(birthdayMembers), "EX", ttl);

  return birthdayMembers;
}

export async function getUpcomingBirthdays(userIds: string[]) {
  const members = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, birthday: true, lastKnownUsername: true },
  });

  const filtered = members.filter((i) => {
    const birthday = dayjs(i.birthday).set("year", dayjs().year());
    const diff = birthday.diff(dayjs(), "day");

    return diff <= 30 && birthday.isAfter(dayjs());
  });

  return sort(filtered).asc((i) => dayjs(i.birthday).set("year", dayjs().year()).diff(dayjs()));
}
