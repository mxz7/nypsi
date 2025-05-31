import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { percentChance } from "../random";
import sleep from "../sleep";
import {
  addInlineNotification,
  addNotificationToQueue,
  getDmSettings,
} from "../users/notifications";
import { addTag } from "../users/tags";
import { addInventoryItem } from "./inventory";
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
export async function addAchievementProgress(userId: string, achievementId: string, amount = 1) {
  if ((await isEcoBanned(userId)).banned) return;
  const query = await prisma.achievements.upsert({
    create: {
      userId: userId,
      achievementId: achievementId,
      progress: amount,
    },
    update: {
      progress: { increment: amount },
    },
    where: {
      userId_achievementId: {
        userId: userId,
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
  userId: string,
  achievementId: string,
  progress: number,
) {
  if ((await isEcoBanned(userId)).banned) return;
  const query = await prisma.achievements.upsert({
    create: {
      userId: userId,
      achievementId: achievementId,
      progress: progress,
    },
    update: {
      progress: progress,
    },
    where: {
      userId_achievementId: {
        userId: userId,
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

export async function getAllAchievements(id: string, filter?: string) {
  if (filter) {
    return await prisma.achievements.findMany({
      where: {
        AND: [{ userId: id }, { achievementId: { startsWith: filter } }],
      },
    });
  }
  return await prisma.achievements.findMany({
    where: {
      userId: id,
    },
  });
}

export async function getCompletedAchievements(member: GuildMember) {
  return await prisma.achievements.findMany({
    where: {
      AND: [{ userId: member.user.id }, { completed: true }],
    },
  });
}

export async function getUncompletedAchievements(id: string) {
  return await prisma.achievements.findMany({
    where: {
      AND: [{ userId: id }, { progress: { gt: 0 } }, { completed: false }],
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

  let earnedXp = 100;
  let earnedCrates = 0;

  if (achievementId.endsWith("_v")) {
    earnedXp = 5000;
    earnedCrates = 5;
  } else if (achievementId.endsWith("_iv")) {
    earnedXp = 1500;
    earnedCrates = 4;
  } else if (achievementId.endsWith("_iii")) {
    earnedXp = 750;
    earnedCrates = 3;
  } else if (achievementId.endsWith("_ii")) {
    earnedXp = 250;
  }

  const rewardsDesc: string[] = [];

  if (earnedXp > 0) {
    rewardsDesc.push(`+ ${earnedXp.toLocaleString()}xp`);

    await addXp(userId, earnedXp);
  }

  if (earnedCrates > 0) {
    rewardsDesc.push(`+ \`${earnedCrates}x\` 🎁 69420 crate`);
    await addInventoryItem(userId, "69420_crate", earnedCrates);
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
        prizes.push(
          `+ \`${amount}x\` ${getItems()[prize.split(":")[0]].emoji} ${
            getItems()[prize.split(":")[0]].name
          }`,
        );
      }
    }

    userEmbed.setDescription((userEmbed.data.description += `\n ${prizes.join("\n")}`));
  }

  if ((await getDmSettings(userId)).other) {
    const payload: NotificationPayload = {
      memberId: userId,
      payload: {
        embed: userEmbed,
      },
    };

    addNotificationToQueue(payload);

    if (percentChance(0.07) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
      await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
      const gems = ["green_gem", "blue_gem", "purple_gem", "pink_gem"];

      const gem = gems[Math.floor(Math.random() * gems.length)];

      logger.info(`${userId} received ${gem} randomly`);

      await addInventoryItem(userId, gem, 1);
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

export async function getUserAchievement(userId: string, achievementId: string) {
  return await prisma.achievements.findUnique({
    where: {
      userId_achievementId: {
        userId: userId,
        achievementId: achievementId,
      },
    },
  });
}

const addProgressMutex = new Set<string>();

export async function addProgress(
  member: GuildMember | string,
  achievementStartName: string,
  amount: number,
  repeat = 0,
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

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

  const achievements = await getAllAchievements(userId, achievementStartName);
  let count = 0;

  for (const achievement of achievements) {
    if (achievement.achievementId.includes(achievementStartName)) count++;
    // will always return if a valid achievement is found
    if (achievement.achievementId.includes(achievementStartName) && !achievement.completed) {
      const res = await addAchievementProgress(userId, achievement.achievementId, amount);

      if (res && !achievement.achievementId.endsWith("_v")) {
        let thing: string;
        if (achievement.achievementId.endsWith("_i")) {
          thing = `${achievementStartName}_ii`;
        } else if (achievement.achievementId.endsWith("_ii")) {
          thing = `${achievementStartName}_iii`;
        } else if (achievement.achievementId.endsWith("_iii")) {
          thing = `${achievementStartName}_iv`;
        } else if (achievement.achievementId.endsWith("iv")) {
          thing = `${achievementStartName}_v`;
        }

        if (thing)
          await setAchievementProgress(userId, thing, Number(achievement.progress) + amount);
      }
      addProgressMutex.delete(userId);
      return;
    }
  }

  switch (count) {
    case 0:
      await setAchievementProgress(userId, `${achievementStartName}_i`, amount);
      break;
    case 1:
      await setAchievementProgress(userId, `${achievementStartName}_ii`, amount);
      break;
    case 2:
      await setAchievementProgress(userId, `${achievementStartName}_iii`, amount);
      break;
    case 3:
      await setAchievementProgress(userId, `${achievementStartName}_iv`, amount);
      break;
    case 4:
      await setAchievementProgress(userId, `${achievementStartName}_v`, amount);
      break;
  }

  addProgressMutex.delete(userId);
}

export async function setProgress(userId: string, achievementStartName: string, amount: number) {
  if (!(await userExists(userId))) return;
  if ((await isEcoBanned(userId)).banned) return;
  const achievements = await getAllAchievements(userId, achievementStartName);
  let count = 0;

  for (const achievement of achievements) {
    if (achievement.achievementId.includes(achievementStartName)) count++;
    // will always return if a valid achievement is found
    if (achievement.achievementId.includes(achievementStartName) && !achievement.completed) {
      const res = await setAchievementProgress(userId, achievement.achievementId, amount);

      if (res && !achievement.achievementId.endsWith("_v")) {
        let thing: string;
        if (achievement.achievementId.endsWith("_i")) {
          thing = `${achievementStartName}_ii`;
        } else if (achievement.achievementId.endsWith("_ii")) {
          thing = `${achievementStartName}_iii`;
        } else if (achievement.achievementId.endsWith("_iii")) {
          thing = `${achievementStartName}_iv`;
        } else if (achievement.achievementId.endsWith("iv")) {
          thing = `${achievementStartName}_v`;
        }

        if (thing) await setAchievementProgress(userId, thing, amount);
      }
      return;
    }
  }

  switch (count) {
    case 0:
      await setAchievementProgress(userId, `${achievementStartName}_i`, amount);
      break;
    case 1:
      await setAchievementProgress(userId, `${achievementStartName}_ii`, amount);
      break;
    case 2:
      await setAchievementProgress(userId, `${achievementStartName}_iii`, amount);
      break;
    case 3:
      await setAchievementProgress(userId, `${achievementStartName}_iv`, amount);
      break;
    case 4:
      await setAchievementProgress(userId, `${achievementStartName}_v`, amount);
      break;
  }
}
