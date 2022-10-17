import { ActionRowBuilder, ButtonBuilder, MessageActionRowComponentBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { NotificationPayload } from "../../types/Notification";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import dayjs = require("dayjs");
import Constants from "../../utils/Constants";

(async () => {
  const userIds = await prisma.dMSettings.findMany({
    where: {
      AND: [
        { vote_reminder: true },
        {
          user: {
            Economy: {
              lastVote: { lte: dayjs().subtract(12, "hours").toDate() },
            },
          },
        },
      ],
    },
    select: {
      userId: true,
    },
  });

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
          .setLabel("top.gg")
      ),
    },
  };

  let amount = 0;

  for (const user of userIds) {
    if (await redis.sismember("nypsi:vote_reminder:received", user.userId)) continue;
    data.memberId = user.userId;

    await addNotificationToQueue(data);

    await redis.sadd("nypsi:vote_reminder:received", user.userId);
    amount++;
  }

  if (amount > 0) parentPort.postMessage(`${amount} vote reminders queued`);

  process.exit(0);
})();
