import pAll = require("p-all");
import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems } from "../../utils/functions/economy/utils";
import { pluralize } from "../../utils/functions/string";
import { getTodaysBirthdays } from "../../utils/functions/users/birthday";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";

export default {
  name: "birthdays",
  cron: "0 1 * * *",
  async run(log, manager) {
    const birthdayMembers = await getTodaysBirthdays(false);
    const functions = [];

    for (const member of birthdayMembers) {
      addNotificationToQueue({
        memberId: member.id,
        payload: {
          content: "happy birthday!!",
          embed: new CustomEmbed(member.id, `you have received 1 ${getItems()["cake"].emoji} cake`),
        },
      });

      functions.push(async () => {
        await addInventoryItem(member.id, "cake", 1);
      });
    }

    await pAll(functions, { concurrency: 5 });

    if (birthdayMembers.length) {
      const res = (
        await manager.broadcastEval(
          async (c, { birthdayMembers }) => {
            const path = await import("path");
            const dayjs = await import("dayjs");
            const { WebhookClient } = await import("discord.js");
            const { logger } = await import(path.join(process.cwd(), "dist", "utils", "logger.js"));
            const { getBirthdayGuilds } = await import(
              path.join(process.cwd(), "dist", "scheduled", "jobs", "birthdays.js")
            );
            const { getOrdinalSuffix } = await import(
              path.join(process.cwd(), "dist", "utils", "functions", "string.js")
            );

            const client = c as unknown as NypsiClient;

            const guilds = await getBirthdayGuilds(Array.from(client.guilds.cache.keys()));

            let successCount = 0;

            for (const guildData of guilds) {
              try {
                const hook = new WebhookClient({ url: guildData.birthdayHook });
                const guild = await client.guilds.fetch(guildData.id);

                const members = await guild.members.fetch({
                  user: birthdayMembers.map((i) => i.id),
                });

                for (const member of members.values()) {
                  try {
                    if (
                      member.user.username === "Deleted User" &&
                      member.user.discriminator === "0000"
                    ) {
                      // deleted user
                      continue;
                    }

                    const birthday = birthdayMembers.find((i) => i.id === member.id);

                    if (!birthday) continue;

                    const years = dayjs().diff(birthday.birthday, "years");

                    const msg = `it's ${member.toString()}'s ${parseInt(birthday.birthday.split("-")[0]) == 69 ? "" : `**${years}${getOrdinalSuffix(years)}** `}birthday today!`;

                    await hook
                      .send({ content: msg })
                      .then(() => {
                        successCount++;
                      })
                      .catch(() => {
                        logger.warn(
                          `failed to send ${member.id} birthday announcement in ${guild.id}`,
                        );
                      });
                  } catch (e) {
                    logger.error(`error handling birthday in ${guildData.id} for ${member.id}`, e);
                  }
                }

                hook.destroy();
              } catch (e) {
                logger.error(`error handling birthdays in ${guildData.id}`, e);
              }
            }

            return successCount;
          },
          { context: { birthdayMembers } },
        )
      ).reduce((acc, num) => acc + num, 0);

      if (res) log(`sent ${res} ${pluralize("birthday announcement", res)}`);

      log(
        `given birthday gifts to ${birthdayMembers.length} ${pluralize("user", birthdayMembers.length)}`,
      );
    }
  },
} satisfies Job;

export async function getBirthdayGuilds(ids: string[]) {
  return await prisma.guild.findMany({
    where: {
      AND: [{ id: { in: ids } }, { birthdayHook: { not: null } }],
    },
    select: {
      id: true,
      birthdayHook: true,
    },
  });
}
