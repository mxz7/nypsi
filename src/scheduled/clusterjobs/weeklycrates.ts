import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { userExists } from "../../utils/functions/economy/utils";
import requestDM from "../../utils/functions/requestdm";
import { getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";

async function doCrates(client: NypsiClient) {
  const query = await prisma.premium.findMany({
    where: {
      AND: [
        {
          status: 1,
        },
        {
          level: { gt: 1 },
        },
      ],
    },
    select: {
      userId: true,
      level: true,
    },
  });

  for (const member of query) {
    if (!(await userExists(member.userId))) continue;

    if (member.level == 2) {
      await addInventoryItem(member.userId, "basic_crate", 1, false);

      const embed = new CustomEmbed().setHeader("thank you for supporting nypsi!").setColor(Constants.EMBED_SUCCESS_COLOR);

      embed.setDescription("you have received 1 **basic crate** 🙂");

      if ((await getDmSettings(member.userId)).premium) {
        await requestDM({
          client: client,
          memberId: member.userId,
          content: "enjoy your weekly crate (:",
          embed: embed,
        }).catch(() => {});
      }
    } else if (member.level == 3) {
      await addInventoryItem(member.userId, "basic_crate", 2, false);

      const embed = new CustomEmbed().setHeader("thank you for supporting nypsi!").setColor(Constants.EMBED_SUCCESS_COLOR);

      embed.setDescription("you have received 2 **basic crates** 🙂");

      if ((await getDmSettings(member.userId)).premium) {
        await requestDM({
          client: client,
          memberId: member.userId,
          content: "enjoy your weekly crates (:",
          embed: embed,
        }).catch(() => {});
      }
    } else if (member.level == 4) {
      await Promise.all([
        addInventoryItem(member.userId, "basic_crate", 2, false),
        addInventoryItem(member.userId, "69420_crate", 1, false),
      ]);

      const embed = new CustomEmbed().setHeader("thank you for supporting nypsi!").setColor(Constants.EMBED_SUCCESS_COLOR);

      embed.setDescription("you have received 2 **basic crates** and 1 **69420 crate** 🙂");

      if ((await getDmSettings(member.userId)).premium) {
        await requestDM({
          client: client,
          memberId: member.userId,
          content: "enjoy your weekly crates (:",
          embed: embed,
        }).catch(() => {});
      }
    }
  }
}

export function runPremiumCrateInterval(client: NypsiClient) {
  const now = new Date();
  const saturday = new Date();
  saturday.setDate(now.getDate() + ((6 - 1 - now.getDay() + 7) % 7) + 1);
  saturday.setHours(0, 10, 0, 0);

  const needed = saturday.getTime() - now.getTime();

  setTimeout(() => {
    doCrates(client);
    setInterval(() => {
      doCrates(client);
    }, 86400 * 1000 * 7);
  }, needed);

  logger.info(`::auto premium crates will run in ${MStoTime(needed)}`);
}
