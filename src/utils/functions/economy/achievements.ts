import { Collection, EmbedBuilder, Guild, GuildMember, WebhookClient } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { getLastKnownTag } from "../users/tag";
import workerSort from "../workers/sort";
import { getAchievements } from "./utils";

/**
 * returns true if user has met requirements for achievement
 */
export async function addAchievementProgress(userId: string, achievementId: string, amount = 1) {
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

  await redis.set(`achievements:completed:${userId}`, achievementId);

  const achievements = getAchievements();

  const completed = await prisma.achievements.count({
    where: {
      AND: [{ achievementId: achievementId }, { completed: true }],
    },
  });

  if (!process.env.ACHIEVEMENTS_HOOK) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${await getLastKnownTag(userId)} has unlocked an achievement` })
    .setDescription(
      `${achievements[achievementId].emoji} ${achievements[achievementId].name}\n\n*${achievements[achievementId].description}*`
    )
    .setFooter({ text: `completed by ${completed.toLocaleString()} ${completed == 1 ? "person" : "people"}` })
    .setTimestamp()
    .setColor("#36393f");

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

export async function topCompletion(guild: Guild, amount = 10): Promise<string[]> {
  let members: Collection<string, GuildMember>;

  if (guild.memberCount == guild.members.cache.size) {
    members = guild.members.cache;
  } else {
    members = await guild.members.fetch();
  }

  if (!members) members = guild.members.cache;

  members = members.filter((m) => {
    return !m.user.bot;
  });

  const query = await prisma.achievements.findMany({
    where: {
      AND: [{ completed: true }, { userId: { in: Array.from(members.keys()) } }],
    },
    select: {
      userId: true,
    },
  });

  if (query.length == 0) {
    return [];
  }

  const allAchievements = Object.keys(getAchievements()).length;
  let userIds = query.map((i) => i.userId);
  const completionRate = new Map<string, number>();

  userIds = [...new Set(userIds)];

  for (const userId of userIds) {
    const achievementsForUser = query.filter((i) => i.userId == userId);

    completionRate.set(userId, (achievementsForUser.length / allAchievements) * 100);
  }

  if (userIds.length > 500) {
    userIds = await workerSort(userIds, completionRate);
    userIds.reverse();
  } else {
    inPlaceSort(userIds).desc((i) => completionRate.get(i));
  }

  const usersFinal = [];

  let count = 0;

  const getMemberID = (guild: Guild, id: string) => {
    const target = guild.members.cache.find((member) => {
      return member.user.id == id;
    });

    return target;
  };

  for (const user of userIds) {
    if (count >= amount) break;
    if (usersFinal.join().length >= 1500) break;

    if (completionRate.get(user) != 0) {
      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      usersFinal[count] =
        pos + " **" + getMemberID(guild, user).user.tag + "** " + completionRate.get(user).toFixed(1) + "%";
      count++;
    }
  }
  return usersFinal;
}
