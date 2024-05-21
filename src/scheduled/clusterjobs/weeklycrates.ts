import prisma from "../../init/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems } from "../../utils/functions/economy/utils";
import requestDM from "../../utils/functions/requestdm";
import { getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";

async function doCrates(client: NypsiClient) {
  const query = await prisma.user.findMany({
    where: {
      OR: [{ booster: true }, { Premium: { level: { gt: 1 } } }],
    },
    select: {
      id: true,
      booster: true,
      Premium: {
        select: {
          level: true,
        },
      },
    },
  });

  for (const member of query) {
    const rewards = new Map<string, number>();

    const embed = new CustomEmbed()
      .setHeader("thank you for supporting nypsi!")
      .setColor(Constants.EMBED_SUCCESS_COLOR);

    if (member.Premium?.level == 2) {
      rewards.set("basic_crate", 2);
    } else if (member.Premium?.level == 3) {
      rewards.set("basic_crate", 4);
    } else if (member.Premium?.level == 4) {
      rewards.set("basic_crate", 5);
      rewards.set("69420_crate", 3);
      rewards.set("nypsi_crate", 1);
      rewards.set("lucky_scratch_card", 1);
    }

    if (member.booster) {
      if (rewards.has("basic_crate")) {
        rewards.set("basic_crate", rewards.get("basic_crate") + 1);
      } else {
        rewards.set("basic_crate", 1);
      }
      if (rewards.has("lucky_scratch_card")) {
        rewards.set("lucky_scratch_card", rewards.get("lucky_scratch_card") + 1);
      } else {
        rewards.set("lucky_scratch_card", 1);
      }
    }

    const desc: string[] = [];

    for (const [key, value] of rewards.entries()) {
      logger.info(`[weekly crates] ${member.id} receiving ${value}x ${key}`);
      await addInventoryItem(member.id, key, value);
      desc.push(
        `+**${value}** ${getItems()[key].emoji} ${
          value > 1
            ? getItems()[key].plural
              ? getItems()[key].plural
              : getItems()[key].name
            : getItems()[key].name
        }`,
      );
    }

    embed.addField("rewards", desc.join("\n"));

    if ((await getDmSettings(member.id)).premium) {
      await requestDM({
        client: client,
        memberId: member.id,
        content: "enjoy your weekly crates (:",
        embed: embed,
      }).catch(() => {});
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
    setInterval(
      () => {
        doCrates(client);
      },
      86400 * 1000 * 7,
    );
  }, needed);

  logger.info(`::auto premium crates will run in ${MStoTime(needed)}`);
}
