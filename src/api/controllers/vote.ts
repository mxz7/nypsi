import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Hono } from "hono";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addBalance } from "../../utils/functions/economy/balance";
import { addBooster } from "../../utils/functions/economy/boosters";
import { addToGuildXP, getGuildByUser } from "../../utils/functions/economy/guilds";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { getRawLevel } from "../../utils/functions/economy/levelling";
import { addStat } from "../../utils/functions/economy/stats";
import { getItems, isEcoBanned, userExists } from "../../utils/functions/economy/utils";
import { addXp } from "../../utils/functions/economy/xp";
import { addKarma } from "../../utils/functions/karma/karma";
import { percentChance } from "../../utils/functions/random";
import { pluralize } from "../../utils/functions/string";
import { createAuraTransaction } from "../../utils/functions/users/aura";
import { isUserBlacklisted } from "../../utils/functions/users/blacklist";
import { addNotificationToQueue, getDmSettings } from "../../utils/functions/users/notifications";
import { logger } from "../../utils/logger";
import ms = require("ms");

const vote = new Hono();

vote.post("/", async (c) => {
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

export default vote;

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

  await redis.set(
    `${Constants.redis.cache.economy.VOTE}:${user}`,
    "true",
    "EX",
    ms("1 hour") / 1000,
  );

  let level = await getRawLevel(user);
  const guild = await getGuildByUser(user);

  if (level > 100) level = 100;

  const amount = Math.floor(15000 * (level / 13 + 1));

  const determineCrateAmount = (value: number) => {
    let amount = 0;

    while (!amount && value >= 0) {
      if (Constants.PROGRESSION.VOTE_CRATE.has(value)) {
        amount = Constants.PROGRESSION.VOTE_CRATE.get(value);
        break;
      }
      value--;
    }

    return amount;
  };

  const crateAmount = determineCrateAmount(votes.voteStreak);
  const newCrateAmount = determineCrateAmount(query.voteStreak) < crateAmount;

  try {
    await Promise.all([
      addBalance(user, amount),
      addKarma(user, 10),
      addXp(user, 100),
      addBooster(user, "vote_booster"),
      redis.del(`${Constants.redis.cache.economy.VOTE}:${user}`),
      redis.del(`${Constants.redis.cache.economy.BOOSTERS}:${user}`),
      addStat(user, "earned-vote", amount),
      addInventoryItem(user, "lottery_ticket", crateAmount),
      createAuraTransaction(user, Constants.BOT_USER_ID, 50),
      addInventoryItem(user, "vote_crate", crateAmount),
    ]).catch((e) => {
      logger.error("vote error", e);
    });

    if (guild) await addToGuildXP(guild.guildName, 100, user);
  } catch (e) {
    logger.error("vote: error", e);
  }

  if (percentChance(0.05) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
    await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
    logger.info(`${user} received blue_gem randomly (vote)`);
    await addInventoryItem(user, "blue_gem", 1);
    addProgress(user, "gem_hunter", 1);

    if ((await getDmSettings(user)).other) {
      addNotificationToQueue({
        memberId: user,
        payload: {
          embed: new CustomEmbed(user)
            .setDescription(
              `${
                getItems()["blue_gem"].emoji
              } you've found a gem! i wonder what powers it holds...`,
            )
            .setTitle("you've found a gem"),
        },
      });
    }
  }

  logger.info(`::success vote: processed for ${user}`);

  const embed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setDescription(
      "you have received the following: \n\n" +
        `+ $**${amount.toLocaleString()}**\n` +
        "+ **3**% multiplier\n" +
        `+ **${crateAmount}** ${pluralize("vote crate", crateAmount)}` +
        `\n+ **${crateAmount}** ${pluralize("lottery ticket", crateAmount)}\n\n` +
        (newCrateAmount && votes.voteStreak > 5
          ? `you will now receive **${crateAmount}** crates each vote thanks to your streak\n\n`
          : "") +
        `you have voted **${votes.monthVote}** ${pluralize("time", votes.monthVote)} this month`,
    )
    .setFooter({ text: `+100xp | streak: ${votes.voteStreak.toLocaleString()}` });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("open crates")
      .setCustomId("vote-crates")
      .setStyle(ButtonStyle.Success),
  );

  if (!(await getDmSettings(user)).voteReminder) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("enable vote reminders")
        .setCustomId("enable-vote-reminders")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  addNotificationToQueue({
    memberId: user,
    payload: {
      content: "thank you for voting!",
      embed: embed,
      components: row,
    },
  });
}
