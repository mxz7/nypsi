import { Hono } from "hono";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../../utils/Constants";
import { isEcoBanned, userExists } from "../../utils/functions/economy/utils";
import { giveVoteRewards } from "../../utils/functions/economy/vote";
import { isUserBlacklisted } from "../../utils/functions/users/blacklist";
import { addNotificationToQueue } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";

const voteController = new Hono();

voteController.post("/", async (c) => {
  if (c.req.header("Authorization") !== process.env.TOPGG_AUTH) {
    c.status(403);
    return c.json({ error: "unauthorized" });
  }

  let body: { user: string };

  try {
    body = await c.req.json();
  } catch {
    c.status(400);
    return c.json({ error: "invalid body" });
  }

  if (!body.user) {
    c.status(400);
    return c.json({ error: "invalid body" });
  }

  doVote(body.user);

  return c.body(null, 200);
});

export default voteController;

async function doVote(user: string) {
  logger.info(`vote: received ${user}`);

  await redis.srem(Constants.redis.nypsi.VOTE_REMINDER_RECEIVED, user);

  if (!(await userExists(user))) {
    logger.warn(`vote: ${user} doesnt exist`);
    return;
  }

  if ((await isUserBlacklisted(user)).blacklisted) {
    logger.info(`vote: ${user} blacklisted`);
    addNotificationToQueue({
      memberId: user,
      payload: {
        content:
          "you voted but you're blacklisted. hahahahahahhhahah no it won't help you hahahahahahhahahahahahahah",
      },
    });
    return;
  }

  const query = await prisma.economy.findUnique({
    where: {
      userId: user,
    },
    select: {
      lastVote: true,
      voteStreak: true,
    },
  });

  const lastVote = query.lastVote.getTime();

  if (Date.now() - lastVote < 25200000) {
    return logger.error(`vote: ${user} already voted`);
  }

  const votes = await prisma.economy.update({
    where: {
      userId: user,
    },
    data: {
      lastVote: new Date(),
      monthVote: { increment: 1 },
      seasonVote: { increment: 1 },
      voteStreak: { increment: 1 },
    },
    select: {
      monthVote: true,
      seasonVote: true,
      voteStreak: true,
    },
  });

  if ((await isEcoBanned(user)).banned) {
    logger.info(`vote: ${user} banned`);
    addNotificationToQueue({
      memberId: user,
      payload: {
        content: "you voted but you're banned. hahahahahahhhahah lol you get NOTHING.",
      },
    });
    return;
  }

  await giveVoteRewards(user, votes);
}
