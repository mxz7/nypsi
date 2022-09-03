import prisma from "../database/database";
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
        return true;
    } else {
        return false;
    }
}
