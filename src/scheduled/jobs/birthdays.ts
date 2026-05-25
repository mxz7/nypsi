import pAll = require("p-all");
import dayjs from "dayjs";
import { WebhookClient } from "discord.js";
import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems } from "../../utils/functions/economy/utils";
import { getAllMembersRest } from "../../utils/functions/guilds/members";
import { getOrdinalSuffix, pluralize } from "../../utils/functions/string";
import { getTodaysBirthdays } from "../../utils/functions/users/birthday";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";

export default {
  name: "birthdays",
  cron: "0 1 * * *",
  async run(log) {
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
      const guilds = await prisma.guild.findMany({
        where: { birthdayHook: { not: null } },
        select: { id: true, birthdayHook: true },
      });

      let successCount = 0;

      for (const guildData of guilds) {
        try {
          const hook = new WebhookClient({ url: guildData.birthdayHook });
          const guildMemberIds = await getAllMembersRest(guildData.id, undefined, true);

          for (const member of birthdayMembers) {
            if (!guildMemberIds.includes(member.id)) continue;
            try {
              const years = dayjs().diff(member.birthday, "years");
              const msg = `it's <@${member.id}>'s ${member.birthday.getFullYear() === 69 ? "" : `**${years}${getOrdinalSuffix(years)}** `}birthday today!`;

              await hook
                .send({ content: msg })
                .then(() => {
                  successCount++;
                })
                .catch(() => {
                  logger.warn(
                    `failed to send ${member.id} birthday announcement in ${guildData.id}`,
                  );
                });
            } catch (e) {
              logger.error(`error handling birthday in ${guildData.id} for ${member.id}`, {
                error: e,
              });
            }
          }

          hook.destroy();
        } catch (e) {
          logger.error(`error handling birthdays in ${guildData.id}`, {
            error: e,
          });
        }
      }

      if (successCount)
        log(`sent ${successCount} ${pluralize("birthday announcement", successCount)}`);
      log(
        `given birthday gifts to ${birthdayMembers.length} ${pluralize("user", birthdayMembers.length)}`,
      );
    }
  },
} satisfies Job;
