import dayjs = require("dayjs");
import { WebhookClient } from "discord.js";
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { MStoTime } from "../../utils/functions/date";
import { logger } from "../../utils/logger";
import ms = require("ms");

async function doBirthdays(client: NypsiClient) {
  const day = dayjs().set("hours", 0).set("minute", 0).set("second", 0).set("millisecond", 0);

  const guilds = await prisma.guild.findMany({
    where: {
      AND: [
        { id: { in: Array.from(client.guilds.cache.keys()) } },
        { birthdayHook: { not: null } },
      ],
    },
    select: {
      id: true,
      birthdayHook: true,
    },
  });

  const birthdayMembers = await prisma.user.findMany({
    where: {
      AND: [
        { birthdayAnnounce: true },
        { birthday: { not: null } },
        { birthday: { gt: day.subtract(12, "hours").toDate() } },
        { birthday: { lt: day.add(12, "hours").toDate() } },
      ],
    },
    select: { id: true, birthday: true },
  });

  for (const guildData of guilds) {
    const hook = new WebhookClient({ url: guildData.birthdayHook });
    const guild = await client.guilds.fetch(guildData.id);

    const members = await guild.members.fetch({ user: birthdayMembers.map((i) => i.id) });

    for (const member of members.values()) {
      const birthday = birthdayMembers.find((i) => i.id === member.id);

      if (!birthday) continue;

      const years = dayjs().diff(birthday.birthday, "years");

      const msg = `it is ${member.toString()}'s **${years}th** birthday today!`;

      await hook
        .send({ content: msg })
        .then(() => {
          logger.info(`::auto sent ${member.id} birthday announcement in ${guild.id}`);
        })
        .catch(() => {
          logger.warn(`failed to send ${member.id} birthday announcement in ${guild.id}`);
        });
    }

    hook.destroy();
  }
}

export function runBirthdays(client: NypsiClient) {
  const next = dayjs()
    .add(1, "day")
    .set("hour", 0)
    .set("minute", 0)
    .set("second", 0)
    .set("millisecond", 0)
    .toDate();

  setTimeout(() => {
    doBirthdays(client);
    setInterval(() => {
      doBirthdays(client);
    }, ms("24 hours"));
  }, next.getTime() - Date.now());

  logger.info(`::auto next birthdays announcement in ${MStoTime(next.getTime() - Date.now())}`);
}
