import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addKarma } from "../karma/karma";
import { getUserId, MemberResolvable } from "../member";
import { percentChance } from "../random";
import { pluralize } from "../string";
import { createAuraTransaction } from "../users/aura";
import { addNotificationToQueue } from "../users/notifications";
import { getPreferences } from "../users/preferences";
import { addProgress } from "./achievements";
import { addBalance } from "./balance";
import { hasGemBeenGiven, markGemAsGiven } from "./gems";
import { addToGuildXP, getGuildByUser } from "./guilds";
import { addInventoryItem, getInventory } from "./inventory";
import { getRawLevel } from "./levelling";
import { addStat } from "./stats";
import { getItems } from "./utils";
import { addXp } from "./xp";
import ms = require("ms");

const voteCache = new RedisCache<number>(Constants.redis.cache.economy.VOTE, 3600);

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

  const cache = await voteCache.get(userId);
  if (cache !== null) return Date.now() - cache < ms("12 hours");

  const lastVote = await getLastVote(userId);

  if (Date.now() - lastVote.getTime() < ms("12 hours")) {
    voteCache.set(userId, lastVote.getTime());
    return true;
  } else {
    voteCache.set(userId, lastVote.getTime());
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
  await voteCache.set(user, Date.now());

  let level = await getRawLevel(user);
  const [guild, inventory] = await Promise.all([getGuildByUser(user), getInventory(user)]);

  let receivedVoteBooster = false;
  if (inventory.count("vote_booster") < 1) {
    addInventoryItem(user, "vote_booster", 1);
    receivedVoteBooster = true;
  }

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
  const nextVoteCrateIncrease = [...Constants.PROGRESSION.VOTE_CRATE.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([streak, amount]) => streak > votes.voteStreak && amount > crateAmount);

  try {
    await Promise.all([
      addBalance(user, amount),
      addKarma(user, 10),
      addXp(user, 100),
      voteCache.delete(user),
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

  if (percentChance(0.05) && !(await hasGemBeenGiven())) {
    await markGemAsGiven();
    logger.info(`${user} received blue_gem randomly (vote)`);
    await addInventoryItem(user, "blue_gem", 1);
    addProgress(user, "gem_hunter", 1);

    if ((await getPreferences(user)).dms.other) {
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
        `+ \`${crateAmount}x\` ${getItems()["vote_crate"].emoji} ${pluralize("vote crate", crateAmount)}\n` +
        `+ \`${crateAmount}x\` ${getItems()["lottery_ticket"].emoji} ${pluralize("lottery ticket", crateAmount)}\n` +
        `${receivedVoteBooster ? `+ \`1x\` ${getItems()["vote_booster"].emoji} vote booster` : "you already have a vote booster"}\n\n` +
        (newCrateAmount && votes.voteStreak > 5
          ? `you will now receive **${crateAmount}** crates each vote thanks to your streak\n\n`
          : "") +
        (nextVoteCrateIncrease
          ? `**${(nextVoteCrateIncrease[0] - votes.voteStreak).toLocaleString()}** ${pluralize(
              "vote",
              nextVoteCrateIncrease[0] - votes.voteStreak,
            )} until your next crate increase! (**${nextVoteCrateIncrease[1]}** ${pluralize(
              "crate",
              nextVoteCrateIncrease[1],
            )} per vote)\n\n`
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

  if (!(await getPreferences(user)).dms.voteReminder) {
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
