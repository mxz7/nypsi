import { Client, ColorResolvable, Guild, GuildMember, Role, User, WebhookClient } from "discord.js";
import prisma from "../database/database";
import { addCooldown, inCooldown } from "../guilds/utils";
import { logger } from "../logger";
import { CustomEmbed } from "../models/EmbedBuilders";
import { PunishmentType } from "../models/GuildStorage";

const modLogQueue: Map<string, CustomEmbed[]> = new Map();
const modLogHookCache: Map<string, WebhookClient> = new Map();
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

    if (modLogQueue.has(guild.id)) {
        modLogQueue.get(guild.id).push(embed);
    } else {
        modLogQueue.set(guild.id, [embed]);
    }
}

export async function isModLogsEnabled(guild: Guild) {
    if (modLogHookCache.has(guild.id)) return true;
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
    if (modLogHookCache.has(guild.id)) modLogHookCache.delete(guild.id);
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

export function runModerationChecks(client: Client) {
    setInterval(async () => {
        const date = new Date();

        const query1 = await prisma.moderationMute.findMany({
            where: {
                expire: { lte: date },
            },
            select: {
                userId: true,
                guildId: true,
            },
        });

        for (const unmute of query1) {
            logger.log({
                level: "auto",
                message: `requesting unmute in ${unmute.guildId} for ${unmute.userId}`,
            });
            requestUnmute(unmute.guildId, unmute.userId, client);
        }

        const query2 = await prisma.moderationBan.findMany({
            where: {
                expire: { lte: date },
            },
            select: {
                userId: true,
                guildId: true,
            },
        });

        for (const unban of query2) {
            logger.log({
                level: "auto",
                message: `requesting unban in ${unban.guildId} for ${unban.userId}`,
            });
            await requestUnban(unban.guildId, unban.userId, client);
        }

        const query3 = await prisma.moderation.findMany({
            where: {
                NOT: { modlogs: "" },
            },
            select: {
                modlogs: true,
                guildId: true,
            },
        });

        for (const modlog of query3) {
            if (!modLogQueue.has(modlog.guildId) || modLogQueue.get(modlog.guildId).length == 0) continue;
            let webhook: WebhookClient;

            if (modLogHookCache.has(modlog.guildId)) {
                webhook = modLogHookCache.get(modlog.guildId);
            } else {
                webhook = new WebhookClient({ url: modlog.modlogs });
                modLogHookCache.set(modlog.guildId, webhook);
            }

            let embeds: CustomEmbed[];

            if (modLogQueue.get(modlog.guildId).length > 10) {
                const current = modLogQueue.get(modlog.guildId);
                embeds = current.splice(0, 10);
                modLogQueue.set(modlog.guildId, current);
            } else {
                embeds = modLogQueue.get(modlog.guildId);
                modLogQueue.set(modlog.guildId, []);
            }

            webhook.send({ embeds: embeds }).catch(async (e) => {
                logger.error(`error sending modlogs to webhook (${modlog.guildId}) - removing modlogs`);
                logger.error(e);

                await prisma.moderation.update({
                    where: {
                        guildId: modlog.guildId,
                    },
                    data: {
                        modlogs: "",
                    },
                });
            });
        }
    }, 30000);
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

export async function deleteMute(guild: Guild, member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.id;
    } else {
        id = member;
    }

    await prisma.moderationMute.deleteMany({
        where: {
            AND: [{ userId: id }, { guildId: guild.id }],
        },
    });
}

export async function deleteBan(guild: Guild, member: GuildMember | string) {
    let id: string;
    if (member instanceof GuildMember) {
        id = member.id;
    } else {
        id = member;
    }

    await prisma.moderationBan.deleteMany({
        where: {
            AND: [{ userId: id }, { guildId: guild.id }],
        },
    });
}

export async function getMuteRole(guild: Guild) {
    const query = await prisma.moderation.findUnique({
        where: {
            guildId: guild.id,
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

async function requestUnban(guild: string | Guild, member: string, client: Client) {
    guild = client.guilds.cache.find((g) => g.id == guild);

    if (!guild) {
        logger.warn("unable to find guild");
        return;
    }

    await deleteBan(guild, member);

    guild.members.unban(member, "ban expired");

    logger.log({
        level: "success",
        message: "ban removed",
    });
}

async function requestUnmute(guild: Guild | string, member: string, client: Client) {
    guild = client.guilds.cache.find((g) => g.id == guild);

    if (!guild) {
        logger.warn(`unable to find guild ${guild}`);
        return;
    }

    let members;

    if (inCooldown(guild)) {
        members = guild.members.cache;
    } else {
        members = await guild.members.fetch();

        addCooldown(guild, 3600);
    }

    let newMember: void | GuildMember = members.find((m) => m.id == member);

    if (!newMember) {
        newMember = await guild.members.fetch(member).catch(() => {
            newMember = undefined;
        });
        if (!newMember) {
            logger.warn("unable to find member, deleting mute..");
            return await deleteMute(guild, member);
        }
    }

    await guild.roles.fetch();

    const muteRoleID = await getMuteRole(guild);

    let muteRole = guild.roles.cache.find((r) => r.id == muteRoleID);

    if (!muteRoleID || muteRoleID == "") {
        muteRole = guild.roles.cache.find((r) => r.name.toLowerCase() == "muted");
    }

    if (!muteRole) {
        logger.warn("unable to find mute role, deleting mute..");
        return await deleteMute(guild, newMember);
    }

    await deleteMute(guild, member);

    logger.log({
        level: "success",
        message: "mute deleted",
    });

    return await newMember.roles.remove(muteRole).catch(() => {
        logger.error("couldnt remove mute role");
    });
}

export async function getMutedUsers(guild: Guild) {
    const query = await prisma.moderationMute.findMany({
        where: {
            guildId: guild.id,
        },
    });

    return query;
}
