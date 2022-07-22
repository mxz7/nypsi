import { parentPort, workerData } from "worker_threads";
import prisma from "../../database/database";

(async () => {
    const guilds: string[] = workerData.guilds;

    const query = await prisma.guild.findMany({
        select: {
            id: true,
        },
    });

    for (const guild of query) {
        const exists = guilds.includes(guild.id);

        if (!exists) {
            await prisma.guildCounter.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.guildChristmas.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.guildCountdown.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.chatReactionStats.deleteMany({
                where: {
                    chatReactionGuildId: guild.id,
                },
            });
            await prisma.chatReaction.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderationMute.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderationBan.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderationCase.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.moderation.deleteMany({
                where: {
                    guildId: guild.id,
                },
            });
            await prisma.guild.deleteMany({
                where: {
                    id: guild.id,
                },
            });

            parentPort.postMessage(`deleted guild ${guild.id} from database`);
        }
    }
    process.exit(0);
})();
