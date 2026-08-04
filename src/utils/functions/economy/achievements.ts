import prisma from "../../../init/database";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { percentChance } from "../random";
import sleep from "../sleep";
import { addInlineNotification, addNotificationToQueue } from "../users/notifications";
import { getPreferences } from "../users/preferences";
import { addTag } from "../users/tags";
import { hasGemBeenGiven, markGemAsGiven } from "./gems";
import { addInventoryItem, addItemSourceStat } from "./inventory";
import {
  createUser,
  getAchievements,
  getItems,
  getTagsData,
  isEcoBanned,
  userExists,
} from "./utils";
import { addXp } from "./xp";

/**
 * returns true if user has met requirements for achievement
 */
async function addAchievementProgress(member: MemberResolvable, achievementId: string, amount = 1) {
  const userId = getUserId(member);

  if ((await isEcoBanned(userId)).banned) return;
  const query = await prisma.achievements.upsert({
    create: {
      userId,
      achievementId: achievementId,
      progress: amount,
    },
    update: {
      progress: { increment: amount },
    },
    where: {
      userId_achievementId: {
        userId,
        achievementId: achievementId,
      },
    },
    select: {
      progress: true,
    },
  });

  const achievements = getAchievements();

  if (query.progress >= achievements[achievementId].target) {
    await completeAchievement(userId, achievementId);
    return true;
  }
  return false;
}

export async function setAchievementProgress(
  member: MemberResolvable,
  achievementId: string,
  progress: number,
) {
  const userId = getUserId(member);

  if ((await isEcoBanned(userId)).banned) return;
  const query = await prisma.achievements.upsert({
    create: {
      userId,
      achievementId: achievementId,
      progress: progress,
    },
    update: {
      progress: progress,
    },
    where: {
      userId_achievementId: {
        userId,
        achievementId: achievementId,
      },
    },
    select: {
      progress: true,
    },
  });

  const achievements = getAchievements();

  if (query.progress >= achievements[achievementId].target) {
    await completeAchievement(userId, achievementId);
    return true;
  }
  return false;
}

export async function getAllAchievements(member: MemberResolvable, filter?: string) {
  const userId = getUserId(member);

  if (filter) {
    return await prisma.achievements.findMany({
      where: {
        AND: [{ userId }, { achievementId: { startsWith: filter } }],
      },
    });
  }
  return await prisma.achievements.findMany({
    where: {
      userId,
    },
  });
}

export async function getCompletedAchievements(member: MemberResolvable) {
  return await prisma.achievements.findMany({
    where: {
      AND: [{ userId: getUserId(member) }, { completed: true }],
    },
  });
}

export async function getUncompletedAchievements(member: MemberResolvable) {
  return await prisma.achievements.findMany({
    where: {
      AND: [{ userId: getUserId(member) }, { progress: { gt: 0 } }, { completed: false }],
    },
  });
}

async function completeAchievement(userId: string, achievementId: string) {
  await prisma.achievements.update({
    where: {
      userId_achievementId: {
        userId: userId,
        achievementId: achievementId,
      },
    },
    data: {
      completed: true,
      completedAt: new Date(),
    },
  });

  logger.info(`${achievementId} completed by ${userId}`);

  if (!(await userExists(userId))) await createUser(userId);

  const achievements = getAchievements();

  const userEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader("achievement unlocked")
    .setDescription(
      `you have completed ${achievements[achievementId].emoji} ${achievements[achievementId].name}`,
    );

  let earnedXp = 250;
  let earnedCrates = 0;

  if (achievementId.endsWith("_v")) {
    earnedXp = 7500;
    earnedCrates = 20;
  } else if (achievementId.endsWith("_iv")) {
    earnedXp = 3000;
    earnedCrates = 15;
  } else if (achievementId.endsWith("_iii")) {
    earnedXp = 1500;
    earnedCrates = 10;
  } else if (achievementId.endsWith("_ii")) {
    earnedXp = 500;
    earnedCrates = 5;
  } else {
    earnedCrates = 2;
  }

  const rewardsDesc: string[] = [];

  if (earnedXp > 0) {
    rewardsDesc.push(`+ ${earnedXp.toLocaleString()}xp`);

    await addXp(userId, earnedXp);
  }

  if (earnedCrates > 0) {
    const earnedTickets = earnedCrates * 25;
    rewardsDesc.push(`+ \`${earnedCrates}x\` 🎁 69420 crate`);
    rewardsDesc.push(`+ \`${earnedTickets}x\` 🎫 lottery ticket`);
    await addInventoryItem(userId, "69420_crate", earnedCrates);
    addItemSourceStat("69420_crate", "achievement", earnedCrates);
    await addInventoryItem(userId, "lottery_ticket", earnedTickets);
    addItemSourceStat("lottery_ticket", "achievement", earnedTickets);
  }

  if (rewardsDesc.length > 0) {
    userEmbed.setDescription(
      (userEmbed.data.description += `\n\nrewards:\n${rewardsDesc.join("\n")}`),
    );
  }

  if (achievements[achievementId].prize) {
    const prizes: string[] = [];
    for (const prize of achievements[achievementId].prize) {
      if (prize.startsWith("tag:")) {
        await addTag(userId, prize.split("tag:")[1]).catch(() => {});
        prizes.push(
          `+ ${getTagsData()[prize.split("tag:")[1]].emoji} ${
            getTagsData()[prize.split("tag:")[1]].name
          } tag`,
        );
      } else {
        const amount = parseInt(prize.split(":")[1]);

        if (!amount) break;

        await addInventoryItem(userId, prize.split(":")[0], amount);
        addItemSourceStat(prize.split(":")[0], "achievement", amount);
        prizes.push(
          `+ \`${amount}x\` ${getItems()[prize.split(":")[0]].emoji} ${
            getItems()[prize.split(":")[0]].name
          }`,
        );
      }
    }

    userEmbed.setDescription((userEmbed.data.description += `\n ${prizes.join("\n")}`));
  }

  if ((await getPreferences(userId)).dms.other) {
    const payload: NotificationPayload = {
      memberId: userId,
      payload: {
        embed: userEmbed,
      },
    };

    addNotificationToQueue(payload);

    if (percentChance(0.07) && !(await hasGemBeenGiven())) {
      await markGemAsGiven();
      const gems = ["green_gem", "blue_gem", "purple_gem", "pink_gem"];

      const gem = gems[Math.floor(Math.random() * gems.length)];

      logger.info(`${userId} received ${gem} randomly`);

      await addInventoryItem(userId, gem, 1);
      addItemSourceStat(gem, "achievement", 1);
      await addProgress(userId, "gem_hunter", 1);

      addNotificationToQueue({
        memberId: userId,
        payload: {
          embed: new CustomEmbed(
            userId,
            `${getItems()[gem].emoji} you've found a gem! i wonder what powers it holds...`,
          ).setTitle("you've found a gem"),
        },
      });
    }
  } else {
    await addInlineNotification({ memberId: userId, embed: userEmbed });
  }
}

export async function getUserAchievement(member: MemberResolvable, achievementId: string) {
  return await prisma.achievements.findUnique({
    where: {
      userId_achievementId: {
        userId: getUserId(member),
        achievementId: achievementId,
      },
    },
  });
}

type UserAchievement = Awaited<ReturnType<typeof getAllAchievements>>[number];

async function cascadeAchievementTiers(
  userId: string,
  achievementStartName: string,
  update: (
    achievementId: string,
    achievement: UserAchievement | undefined,
    achievements: UserAchievement[],
  ) => Promise<boolean>,
) {
  const achievementData = getAchievements();
  const achievementIds = ["i", "ii", "iii", "iv", "v"]
    .map((tier) => `${achievementStartName}_${tier}`)
    .filter((achievementId) => achievementData[achievementId]);
  const achievements = await getAllAchievements(userId, achievementStartName);
  const achievementsById = new Map(
    achievements.map((achievement) => [achievement.achievementId, achievement]),
  );

  for (const achievementId of achievementIds) {
    const achievement = achievementsById.get(achievementId);

    if (achievement?.completed) continue;
    if (!(await update(achievementId, achievement, achievements))) break;
  }
}

const addProgressMutex = new Set<string>();

export async function addProgress(
  member: MemberResolvable,
  achievementStartName: string,
  amount: number,
  repeat = 0,
) {
  const userId = getUserId(member);

  if (addProgressMutex.has(userId)) {
    if (repeat > 10) addProgressMutex.delete(userId);
    await sleep(100);
    return addProgress(userId, achievementStartName, amount, repeat + 1);
  }

  addProgressMutex.add(userId);

  if (!(await userExists(userId))) {
    addProgressMutex.delete(userId);
    return;
  }
  if ((await isEcoBanned(userId)).banned) {
    addProgressMutex.delete(userId);
    return;
  }

  let progress: number;
  let incrementApplied = false;

  await cascadeAchievementTiers(
    userId,
    achievementStartName,
    async (achievementId, achievement, achievements) => {
      if (!incrementApplied) {
        incrementApplied = true;

        if (achievement) {
          progress = Number(achievement.progress) + amount;
          return addAchievementProgress(userId, achievementId, amount);
        }

        const completedProgress = achievements
          .filter((entry) => entry.completed)
          .reduce((highest, entry) => Math.max(highest, Number(entry.progress)), 0);

        progress = completedProgress + amount;
      }

      return addAchievementProgress(userId, achievementId, progress);
    },
  );

  addProgressMutex.delete(userId);
}

export async function setProgress(
  member: MemberResolvable,
  achievementStartName: string,
  amount: number,
) {
  const userId = getUserId(member);

  if (!(await userExists(userId))) return;
  if ((await isEcoBanned(userId)).banned) return;

  await cascadeAchievementTiers(userId, achievementStartName, (achievementId) =>
    setAchievementProgress(userId, achievementId, amount),
  );
}
