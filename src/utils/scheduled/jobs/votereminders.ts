import { ActionRowBuilder, ButtonBuilder, MessageActionRowComponentBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { parentPort } from "worker_threads";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import dayjs = require("dayjs");

(async () => {
  const userIds = await prisma.dMSettings.findMany({
    where: {
      vote_reminder: true,
    },
    select: {
      userId: true,
    },
  });

  const toSendReminder = await prisma.economy
    .findMany({
      where: {
        AND: [
          { userId: { in: userIds.map((u) => u.userId) } },
          { lastVote: { lte: dayjs().subtract(12, "hours").toDate() } },
        ],
      },
      select: { userId: true },
    })
    .then((q) => q.map((i) => i.userId));

  const data = {
    memberId: "boob",
    embed: new CustomEmbed()
      .setDescription("it has been more than 12 hours since you last voted")
      .setColor("#36393f")
      .toJSON(),
    components: new ActionRowBuilder<MessageActionRowComponentBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL("https://top.gg/bot/678711738845102087/vote")
          .setLabel("top.gg")
      )
      .toJSON(),
  };

  let amount = 0;

  for (const user of toSendReminder) {
    if (await redis.sismember("nypsi:vote_reminder:received", user)) return;
    data.memberId = user;
    await redis.lpush("nypsi:dm:queue", JSON.stringify(data));
    await redis.sadd("nypsi:vote_reminder:received", user);
    amount++;
  }

  if (amount > 0) parentPort.postMessage(`${amount} vote reminders queued`);

  process.exit(0);
})();
