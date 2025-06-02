import prisma from "../../init/database";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getItems } from "../../utils/functions/economy/utils";
import { pluralize } from "../../utils/functions/string";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";

export default {
  name: "weeklycrates",
  cron: "15 0 * * 6",
  async run(log) {
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
        log(`${member.id} receiving ${value}x ${key}`);
        await addInventoryItem(member.id, key, value);
        desc.push(`+**${value}** ${getItems()[key].emoji} ${pluralize(getItems()[key], value)}`);
      }

      embed.addField("rewards", desc.join("\n"));

      if ((await getDmSettings(member.id)).premium) {
        addNotificationToQueue({
          memberId: member.id,
          payload: {
            content: "enjoy your weekly crates (:",
            embed: embed,
          },
        });
      }
    }
  },
} satisfies Job;
