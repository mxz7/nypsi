import { ColorResolvable, Guild, GuildMember, Role, User, WebhookClient } from "discord.js";
import prisma from "../database/database";
import redis from "../database/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed } from "../models/EmbedBuilders";
import { PunishmentType } from "../models/GuildStorage";

const modLogColors: Map<PunishmentType, ColorResolvable> = new Map();

modLogColors.set(PunishmentType.MUTE, "#ffffba");
modLogColors.set(PunishmentType.BAN, "#ffb3ba");
modLogColors.set(PunishmentType.UNMUTE, "#ffffba");
modLogColors.set(PunishmentType.WARN, "#bae1ff");
modLogColors.set(PunishmentType.KICK, "#ffdfba");
modLogColors.set(PunishmentType.UNBAN, "#ffb3ba");
modLogColors.set(PunishmentType.FILTER_VIOLATION, "#baffc9");

export async function createProfile(guild: Guild) {
    await prisma.moderation.create({
        data: {
            guildId: guild.id,
        },
    });
}

export async function profileExists(guild: Guild) {
    const query = await prisma.moderation.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            guildId: true,
        },
    });

    if (!query) {
        return false;
    } else {
        return true;
    }
}

export async function getCaseCount(guild: Guild) {
    const query = await prisma.moderation.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            caseCount: true,
        },
    });

    return query.caseCount;
}

export async function newCase(
    guild: Guild,
    caseType: PunishmentType,
    userIDs: string[] | string,
    moderator: string,
    command: string
) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs];
    }
    for (const userID of userIDs) {
        const caseCount = await getCaseCount(guild);
        await prisma.moderationCase.create({
            data: {
                guildId: guild.id,
                caseId: caseCount.toString(),
                type: caseType,
                user: userID,
                moderator: moderator,
                command: command,
                time: new Date(),
            },
        });
        await prisma.moderation.update({
            where: {
                guildId: guild.id,
            },
            data: {
                caseCount: { increment: 1 },
            },
        });

        if (!(await isModLogsEnabled(guild))) return;

        addModLog(guild, caseType, userID, moderator, command, caseCount);
    }
}

export async function addModLog(
    guild: Guild,
    caseType: PunishmentType,
    userID: string,
    moderator: string,
    command: string,
    caseID: number
) {
    let punished: GuildMember | User | void = await guild.members.fetch(userID).catch(() => {});

    if (!punished) {
        punished = await guild.client.users.fetch(userID).catch(() => {});
    }

    const embed = new CustomEmbed().disableFooter();
    embed.setColor(modLogColors.get(caseType));
    embed.setTitle(`${caseType}${caseID > -1 ? ` [${caseID}]` : ""}`);
    embed.setTimestamp();

    if (punished) {
        embed.addField("user", `${punished.toString()} (${punished.id})`, true);
    } else {
        embed.addField("user", userID, true);
    }

    if (moderator != "nypsi") {
        embed.addField("moderator", moderator, true);
    } else {
        embed.addField("moderator", "nypsi", true);
    }

    if (caseType == PunishmentType.FILTER_VIOLATION) {
        embed.addField("message content", command);
    } else {
        embed.addField("reason", command);
    }

    await redis.lpush(`modlogs:${guild.id}`, JSON.stringify(embed.toJSON()));
}

export async function isModLogsEnabled(guild: Guild) {
    const query = await prisma.moderation.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            modlogs: true,
        },
    });

    if (!query || !query.modlogs) return false;

    return true;
}

export async function setModLogs(guild: Guild, hook: string) {
    await prisma.moderation.update({
        where: {
            guildId: guild.id,
        },
        data: {
            modlogs: hook,
        },
    });
}

export async function getModLogsHook(guild: Guild): Promise<WebhookClient | undefined> {
    const query = await prisma.moderation.findUnique({
        where: {
            guildId: guild.id,
        },
        select: {
            modlogs: true,
        },
    });

    if (!query.modlogs) return undefined;

    return new WebhookClient({ url: query.modlogs });
}

export async function deleteCase(guild: Guild, caseID: string) {
    await prisma.moderationCase.updateMany({
        where: {
            AND: [{ guildId: guild.id }, { caseId: caseID.toString() }],
        },
        data: {
            deleted: true,
        },
    });
}

export async function deleteServer(guild: Guild | string) {
    let id: string;
    if (guild instanceof Guild) {
        id = guild.id;
    } else {
        id = guild;
    }

    await prisma.moderationMute.deleteMany({
        where: {
            guildId: id,
        },
    });
    await prisma.moderationBan.deleteMany({
        where: {
            guildId: id,
        },
    });
    await prisma.moderationCase.deleteMany({
        where: {
            guildId: id,
        },
    });
    await prisma.moderation.delete({
        where: {
            guildId: id,
        },
    });
}

export async function getCases(guild: Guild, userID: string) {
    const query = await prisma.moderationCase.findMany({
        where: {
            AND: [{ guildId: guild.id }, { user: userID }],
        },
    });

    return query.reverse();
}

export async function getAllCases(guild: Guild) {
    const query = await prisma.moderationCase.findMany({
        where: {
            guildId: guild.id,
        },
        select: {
            user: true,
            moderator: true,
            type: true,
            deleted: true,
        },
    });

    return query.reverse();
}

export async function getCase(guild: Guild, caseID: number) {
    if (caseID > (await getCaseCount(guild))) return undefined;

    const query = await prisma.moderationCase.findFirst({
        where: {
            AND: [{ guildId: guild.id }, { caseId: caseID.toString() }],
        },
    });

    if (!query) return undefined;

    return query;
}

export async function newMute(guild: Guild, userIDs: string[], date: Date) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs];
    }
    for (const userID of userIDs) {
        await prisma.moderationMute.create({
            data: {
                userId: userID,
                expire: date,
                guildId: guild.id,
            },
        });
    }
}

export async function newBan(guild: Guild, userIDs: string[] | string, date: Date) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs];
    }

    for (const userID of userIDs) {
        await prisma.moderationBan.create({
            data: {
                userId: userID,
                expire: date,
                guildId: guild.id,
            },
        });
    }
}

export async function isMuted(guild: Guild, member: GuildMember) {
    const query = await prisma.moderationMute.findFirst({
        where: {
            AND: [{ guildId: guild.id }, { userId: member.user.id }],
        },
        select: {
            userId: true,
        },
    });

    if (query) {
        return true;
    } else {
        return false;
    }
}

export async function isBanned(guild: Guild, member: GuildMember) {
    const query = await prisma.moderationBan.findFirst({
        where: {
            AND: [{ guildId: guild.id }, { userId: member.user.id }],
        },
        select: {
            userId: true,
        },
    });

    if (query) {
        return true;
    } else {
        return false;
    }
}

export async function setReason(guild: Guild, caseID: number, reason: string) {
    await prisma.moderationCase.updateMany({
        where: {
            AND: [{ caseId: caseID.toString() }, { guildId: guild.id }],
        },
        data: {
            command: reason,
        },
    });
}

export async function deleteMute(guild: Guild | string, member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.id;
    } else {
        id = member;
    }

    let guildId: string;
    if (guild instanceof Guild) {
        guildId = guild.id;
    } else {
        guildId = guild;
    }

    await prisma.moderationMute.deleteMany({
        where: {
            AND: [{ userId: id }, { guildId: guildId }],
        },
    });
}

export async function deleteBan(guild: Guild | string, member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.id;
    } else {
        id = member;
    }

    let guildId: string;
    if (guild instanceof Guild) {
        guildId = guild.id;
    } else {
        guildId = guild;
    }

    await prisma.moderationBan.deleteMany({
        where: {
            AND: [{ userId: id }, { guildId: guildId }],
        },
    });
}

export async function getMuteRole(guild: Guild | string) {
    let guildId: string;
    if (guild instanceof Guild) {
        guildId = guild.id;
    } else {
        guildId = guild;
    }

    const query = await prisma.moderation.findUnique({
        where: {
            guildId: guildId,
        },
        select: {
            muteRole: true,
        },
    });

    if (query.muteRole == "") {
        return undefined;
    } else {
        return query.muteRole;
    }
}

export async function setMuteRole(guild: Guild, role: Role | string) {
    let id: string;

    if (role instanceof Role) {
        id = role.id;
    } else {
        id = role;
    }

    await prisma.moderation.update({
        where: {
            guildId: guild.id,
        },
        data: {
            muteRole: id,
        },
    });
}

export async function requestUnban(guildId: string, member: string, client: NypsiClient) {
    await client.shard.broadcastEval(
        async (c, { guildId, memberId }) => {
            const guild = await c.guilds.fetch(guildId).catch(() => {});

            if (!guild) return;

            await guild.members.unban(memberId, "ban expired").catch(() => {});
        },
        { context: { guildId: guildId, memberId: member } }
    );

    await deleteBan(guildId, member);
}

export async function requestUnmute(guildId: string, member: string, client: NypsiClient) {
    const muteRoleId = await getMuteRole(guildId);

    await client.shard.broadcastEval(
        async (c, { guildId, memberId, muteRoleId }) => {
            const guild = await c.guilds.fetch(guildId).catch(() => {});

            if (!guild) return;

            const member = await guild.members.fetch(memberId).catch(() => {});

            if (!member) return;

            let role = muteRoleId;

            if (muteRoleId == "") {
                role = guild.roles.cache.find((r) => r.name == "muted").id;
            }

            await member.roles.remove(role, "mute expired").catch(() => {});
        },
        {
            context: { guildId: guildId, memberId: member, muteRoleId: muteRoleId },
        }
    );

    await deleteMute(guildId, member);
}

export async function getMutedUsers(guild: Guild) {
    const query = await prisma.moderationMute.findMany({
        where: {
            guildId: guild.id,
        },
    });

    return query;
}
