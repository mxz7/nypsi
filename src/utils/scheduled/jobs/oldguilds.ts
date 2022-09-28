import dayjs = require("dayjs");
import { parentPort, workerData } from "worker_threads";
import prisma from "../../database/database";
import redis from "../../database/redis";

(async () => {
  const guilds: string[] = workerData.guilds;

  if (guilds.length < 5000) return parentPort.postMessage("less than 5k guilds. not running.");

  const date = dayjs().subtract(1, "day").toDate();

  const query = await prisma.guild.findMany({
    where: {
      AND: [{ id: { notIn: guilds } }, { createdAt: { lt: date } }],
    },
    select: {
      id: true,
    },
  });

  for (const guild of query) {
    const exists = guilds.includes(guild.id);

    if (!exists) {
      await prisma.guildCounter.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.guildChristmas.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.guildCountdown.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.chatReactionStats.deleteMany({
        where: {
          chatReactionGuildId: guild.id,
        },
      });
      await prisma.chatReaction.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.moderationMute.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.moderationBan.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.moderationCase.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.moderation.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
      await prisma.guild.deleteMany({
        where: {
          id: guild.id,
        },
      });

      await redis.del(`cache:guild:exists:${guild.id}`);
      await redis.del(`cache:guild:prefix:${guild.id}`);
      await redis.del(`cache:guild:percentmatch:${guild.id}`);

      parentPort.postMessage(`deleted guild ${guild.id} from database`);
    }
  }
  process.exit(0);
})();
