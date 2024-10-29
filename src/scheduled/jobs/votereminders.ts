import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { NotificationPayload } from "../../types/Notification";
import Constants from "../../utils/Constants";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import dayjs = require("dayjs");

const data: NotificationPayload = {
  memberId: "boob",
  payload: {
    embed: new CustomEmbed()
      .setDescription("it has been more than 12 hours since you last voted")
      .setColor(Constants.TRANSPARENT_EMBED_COLOR),

    components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL("https://top.gg/bot/678711738845102087/vote")
        .setLabel("top.gg"),
    ),
  },
};

const queued = new Set<string>();

export default {
  name: "vote reminders",
  cron: "0 * * * *",
  run: async (log) => {
    const userIds = await prisma.dMSettings.findMany({
      where: {
        AND: [
          { voteReminder: true },
          {
            user: {
              Economy: {
                lastVote: { lte: dayjs().subtract(11, "hours").toDate() },
              },
            },
          },
        ],
      },
      select: {
        userId: true,
        user: {
          select: {
            Economy: {
              select: {
                lastVote: true,
              },
            },
          },
        },
      },
    });

    let amount = 0;

    for (const user of userIds) {
      if (
        (await redis.sismember(Constants.redis.nypsi.VOTE_REMINDER_RECEIVED, user.userId)) ||
        queued.has(user.userId)
      )
        continue;

      amount++;

      if (
        user.user.Economy.lastVote.getTime() <= dayjs().subtract(12, "hours").toDate().getTime()
      ) {
        data.memberId = user.userId;

        addNotificationToQueue(data);

        await redis.sadd(Constants.redis.nypsi.VOTE_REMINDER_RECEIVED, user.userId);
      } else {
        queued.add(user.userId);
        setTimeout(
          () => {
            queued.delete(user.userId);
            redis.sadd(Constants.redis.nypsi.VOTE_REMINDER_RECEIVED, user.userId);
            data.memberId = user.userId;
            addNotificationToQueue(data);
          },
          user.user.Economy.lastVote.getTime() - dayjs().subtract(12, "hours").toDate().getTime(),
        );
      }
    }

    if (amount > 0) log(`${amount} vote reminders queued`);
  },
} satisfies Job;
