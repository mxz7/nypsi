import { EmbedBuilder, GuildMember, WebhookClient } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { NotificationPayload } from "../../../types/Notification";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { addNotificationToQueue, getDmSettings } from "../users/notifications";
import { getLastKnownTag } from "../users/tag";
import { addInventoryItem } from "./inventory";
import { createUser, getAchievements, getItems, isEcoBanned, userExists } from "./utils";
import { getXp, updateXp } from "./xp";

/**
 * returns true if user has met requirements for achievement
 */
export async function addAchievementProgress(userId: string, achievementId: string, amount = 1) {
  if (await isEcoBanned(userId)) return;
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

export async function setAchievementProgress(userId: string, achievementId: string, progress: number) {
  if (await isEcoBanned(userId)) return;
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

export async function getAllAchievements(id: string) {
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
    .setColor(Constants.TRANSPARENT_EMBED_COLOR)
    .setHeader("achievement unlocked")
    .setDescription(`you have completed ${achievements[achievementId].emoji} ${achievements[achievementId].name}`);

  let earnedXp = 100;
  let earnedCrates = 0;

  if (achievementId.endsWith("_v")) {
    earnedXp = 5000;
    earnedCrates = 3;
  } else if (achievementId.endsWith("_iv")) {
    earnedXp = 1500;
    earnedCrates = 2;
  } else if (achievementId.endsWith("_iii")) {
    earnedXp = 750;
    earnedCrates = 1;
  } else if (achievementId.endsWith("_ii")) {
    earnedXp = 250;
  }

  userEmbed.setDescription(
    (userEmbed.data.description += `\n\nrewards:\n + ${earnedXp.toLocaleString()}xp${
      earnedCrates > 0 ? `\n + ${earnedCrates} 🎁 69420 crate${earnedCrates > 1 ? "s" : ""}` : ""
    }`)
  );

  await updateXp(userId, (await getXp(userId)) + earnedXp);
  if (earnedCrates > 0) await addInventoryItem(userId, "69420_crate", earnedCrates);

  if (achievements[achievementId].prize) {
    await addInventoryItem(userId, achievements[achievementId].prize, 1, false);
    userEmbed.setDescription(
      (userEmbed.data.description += `\n + 1 ${getItems()[achievements[achievementId].prize].emoji} ${
        getItems()[achievements[achievementId].prize].name
      }`)
    );
  }

  if ((await getDmSettings(userId)).other) {
    const payload: NotificationPayload = {
      memberId: userId,
      payload: {
        embed: userEmbed,
      },
    };

    await addNotificationToQueue(payload);
  } else {
    await redis.set(`achievements:completed:${userId}`, JSON.stringify(userEmbed.toJSON()));
  }

  if (!process.env.ACHIEVEMENTS_HOOK) return;

  const completed = await prisma.achievements.count({
    where: {
      AND: [{ achievementId: achievementId }, { completed: true }],
    },
  });

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${await getLastKnownTag(userId)} has unlocked an achievement` })
    .setDescription(
      `${achievements[achievementId].emoji} ${achievements[achievementId].name}\n\n*${achievements[achievementId].description}*`
    )
    .setFooter({ text: `completed by ${completed.toLocaleString()} ${completed == 1 ? "person" : "people"}` })
    .setTimestamp()
    .setColor(Constants.TRANSPARENT_EMBED_COLOR);

  const hook = new WebhookClient({ url: process.env.ACHIEVEMENTS_HOOK });

  hook.send({ embeds: [embed] });
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

export async function addProgress(userId: string, achievementStartName: string, amount: number) {
  if (await isEcoBanned(userId)) return;
  const achievements = await getAllAchievements(userId);
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

        if (thing) await setAchievementProgress(userId, thing, achievement.progress + amount);
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

export async function setProgress(userId: string, achievementStartName: string, amount: number) {
  if (await isEcoBanned(userId)) return;
  const achievements = await getAllAchievements(userId);
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
