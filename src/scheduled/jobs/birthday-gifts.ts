import pAll = require("p-all");
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { getItems } from "../../utils/functions/economy/utils";
import { pluralize } from "../../utils/functions/string";
import { getTodaysBirthdays } from "../../utils/functions/users/birthday";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import { addInventoryItem } from "../../utils/functions/economy/inventory";

export default {
  name: "birthday gifts",
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

    if (birthdayMembers.length)
      log(
        `given birthday gifts to ${birthdayMembers.length} ${pluralize("user", birthdayMembers.length)}`,
      );
  },
} satisfies Job;
