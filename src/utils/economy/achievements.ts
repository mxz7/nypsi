import { GuildMember } from "discord.js";
import prisma from "../database/database";
import redis from "../database/redis";
import { getAchievements } from "./utils";

/**
 * returns true if user has met requirements for achievement
 */
export async function addAchievementProgress(userId: string, achievementId: string) {
    const query = await prisma.achievements.upsert({
        create: {
            userId: userId,
            achievementId: achievementId,
        },
        update: {
            progress: { increment: 1 },
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
    }
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
    }
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
            AND: [{ userId: id }, { progress: { gt: 0 } }],
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
}
