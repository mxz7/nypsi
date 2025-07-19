import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addKarma } from "../karma/karma";
import { getUserId, MemberResolvable } from "../member";
import { percentChance } from "../random";
import { pluralize } from "../string";
import { createAuraTransaction } from "../users/aura";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { addProgress } from "./achievements";
import { addBalance } from "./balance";
import { addBooster } from "./boosters";
import { addToGuildXP, getGuildByUser } from "./guilds";
import { addInventoryItem } from "./inventory";
import { getRawLevel } from "./levelling";
import { addStat } from "./stats";
import { getItems } from "./utils";
import { addXp } from "./xp";
import ms = require("ms");

export async function getLastVote(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      lastVote: true,
    },
  });

  return query.lastVote;
}

export async function hasVoted(member: MemberResolvable) {
  const userId = getUserId(member);

  if (await redis.exists(`${Constants.redis.cache.economy.VOTE}:${userId}`)) {
    const res = parseInt(await redis.get(`${Constants.redis.cache.economy.VOTE}:${userId}`));

    return Date.now() - res < ms("12 hours");
  }

  const lastVote = await getLastVote(userId);

  if (Date.now() - lastVote.getTime() < ms("12 hours")) {
    redis.set(
      `${Constants.redis.cache.economy.VOTE}:${userId}`,
      lastVote.getTime(),
      "EX",
      ms("1 hour") / 1000,
    );
    return true;
  } else {
    redis.set(
      `${Constants.redis.cache.economy.VOTE}:${userId}`,
      lastVote.getTime(),
      "EX",
      ms("1 hour") / 1000,
    );
    return false;
  }
}

export async function getVoteStreak(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      voteStreak: true,
    },
  });

  return query?.voteStreak || 0;
}

export async function setVoteStreak(member: MemberResolvable, amount: number) {
  await prisma.economy.update({
    where: {
      userId: getUserId(member),
    },
    data: {
      voteStreak: amount,
    },
  });
}

export async function giveVoteRewards(
  user: string,
  votes: {
    monthVote: number;
    seasonVote: number;
    voteStreak: number;
  },
) {
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
  const newCrateAmount = determineCrateAmount(votes.voteStreak - 1) < crateAmount;

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
