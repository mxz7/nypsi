import { Client, ColorResolvable, Guild, GuildMember, Role, WebhookClient } from "discord.js"
import { getDatabase } from "../database/database"
import { addCooldown, inCooldown } from "../guilds/utils"
import { logger } from "../logger"
import { CustomEmbed } from "../models/EmbedBuilders"
import { Case, PunishmentType } from "../models/GuildStorage"

declare function require(name: string)

const db = getDatabase()
const modLogQueue: Map<string, CustomEmbed[]> = new Map()
const modLogHookCache: Map<string, WebhookClient> = new Map()
const modLogColors: Map<PunishmentType, ColorResolvable> = new Map()

modLogColors.set(PunishmentType.MUTE, "#ffffba")
modLogColors.set(PunishmentType.BAN, "#ffb3ba")
modLogColors.set(PunishmentType.UNMUTE, "#ffffba")
modLogColors.set(PunishmentType.WARN, "#bae1ff")
modLogColors.set(PunishmentType.KICK, "#ffdfba")
modLogColors.set(PunishmentType.UNBAN, "#ffb3ba")
modLogColors.set(PunishmentType.FILTER_VIOLATION, "#baffc9")

setInterval(async () => {
    const { checkGuild } = require("../../nypsi")

    const query = db.prepare("SELECT id FROM moderation").all()

    for (const guild of query) {
        const exists = await checkGuild(guild.id)

        if (!exists) {
            deleteServer(guild)

            logger.log({
                level: "guild",
                message: `deleted guild '${guild.id}' from moderation data`,
            })
        }
    }
}, 24 * 60 * 60 * 1000)

/**
 *
 * @param {Guild} guild guild to create profile for
 */
export function createProfile(guild: Guild) {
    db.prepare("INSERT INTO moderation (id) VALUES (?)").run(guild.id)
}

/**
 * @returns {Boolean}
 * @param {Guild} guild check if profile exists for this guild
 */
export function profileExists(guild: Guild): boolean {
    const query = db.prepare("SELECT id FROM moderation WHERE id = ?").get(guild.id)

    if (!query) {
        return false
    } else {
        return true
    }
}

/**
 * @returns {Number}
 * @param {Guild} guild guild to get case count of
 */
export function getCaseCount(guild: Guild): number {
    const query = db.prepare("SELECT case_count FROM moderation WHERE id = ?").get(guild.id)

    return query.case_count
}

/**
 *
 * @param {Guild} guild guild to create new case in
 * @param {String} caseType mute, unmute, kick, warn, ban, unban
 * @param {Array<String>} userIDs list of user ids
 * @param {String} moderator moderator issuing punishment
 * @param {String} command entire message
 */
export function newCase(
    guild: Guild,
    caseType: PunishmentType,
    userIDs: Array<string> | string,
    moderator: string,
    command: string
) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs]
    }
    for (const userID of userIDs) {
        const caseCount = getCaseCount(guild)
        db.prepare(
            "INSERT INTO moderation_cases (case_id, type, user, moderator, command, time, deleted, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(caseCount.toString(), caseType, userID, moderator, command, new Date().getTime(), 0, guild.id)
        db.prepare("UPDATE moderation SET case_count = ? WHERE id = ?").run(caseCount + 1, guild.id)

        addModLog(guild, caseType, userID, moderator, command, caseCount + 1)
    }
}

async function addModLog(
    guild: Guild,
    caseType: PunishmentType,
    userID: string,
    moderator: string,
    command: string,
    caseID: number
) {
    const punished = await guild.members.fetch(userID)
    let staff: GuildMember | string

    if (moderator == guild.me.user.id) {
        staff = "nypsi"
    } else {
        staff = await guild.members.fetch(moderator)
    }

    const embed = new CustomEmbed()
    embed.setColor(modLogColors.get(caseType))
    embed.setDescription(`user: <@${userID}>${punished ? ` ${punished.user.tag} (${punished.user.id})` : ""}`)
    embed.setTitle(`${caseType} [${caseID}]`)
    embed.setTimestamp()

    if (staff instanceof GuildMember) {
        embed.setHeader(`${staff.user.tag} (${staff.user.id})`, staff.user.avatarURL())
    } else {
        embed.setHeader(staff, guild.me.avatarURL())
    }

    embed.addField("reason", command)

    if (modLogQueue.has(guild.id)) {
        modLogQueue.get(guild.id).push(embed)
    } else {
        modLogQueue.set(guild.id, [embed])
    }
}

export function isModLogsEnabled(guild: Guild) {
    const query = db.prepare("SELECT modlogs FROM moderation WHERE id = ?").get(guild.id)

    if (!query || !query.modlogs) return false

    return true
}

/**
 *
 * @param {Guild} guild guild to delete case in
 * @param {String} caseID case to delete
 */
export function deleteCase(guild: Guild, caseID: string) {
    db.prepare("UPDATE moderation_cases SET deleted = 1 WHERE guild_id = ? AND case_id = ?").run(guild.id, caseID.toString())
}

/**
 *
 * @param {Guild} guild guild to delete data for
 */
export function deleteServer(guild: Guild | string) {
    let id: string
    if (guild instanceof Guild) {
        id = guild.id
    } else {
        id = guild
    }

    db.prepare("DELETE FROM moderation_cases WHERE guild_id = ?").run(id)
    db.prepare("DELETE FROM moderation_mutes WHERE guild_id = ?").run(id)
    db.prepare("DELETE FROM moderation_bans WHERE guild_id = ?").run(id)
    db.prepare("DELETE FROM moderation WHERE id = ?").run(id)
}

/**
 * @returns {Array}
 * @param {Guild} guild guild to get cases of
 * @param {String} userID user to get cases of
 */
export function getCases(guild: Guild, userID: string): Array<Case> {
    const query = db.prepare("SELECT * FROM moderation_cases WHERE guild_id = ? AND user = ?").all(guild.id, userID)

    for (const d of query) {
        d.case_id = parseInt(d.case_id)
    }

    return query.reverse()
}

/**
 * @returns {Object}
 * @param {Guild} guild guild to get cases of
 */
export function getAllCases(guild: Guild): Case[] {
    const query = db.prepare("SELECT user, moderator, type, deleted FROM moderation_cases WHERE guild_id = ?").all(guild.id)

    return query.reverse()
}

/**
 * @returns {JSON} case
 * @param {Guild} guild guild to search for case in
 * @param {Number} caseID case to fetch
 */
export function getCase(guild: Guild, caseID: number): Case {
    if (caseID > getCaseCount(guild)) return undefined

    let query = db
        .prepare("SELECT * FROM moderation_cases WHERE guild_id = ? AND case_id = ?")
        .get(guild.id, caseID.toString())

    if (!query) {
        query = db
            .prepare("SELECT * FROM moderation_cases WHERE guild_id = ? AND case_id = ?")
            .get(guild.id, caseID.toString() + ".0")
    }

    if (!query) return undefined

    query.case_id = parseInt(query.case_id)

    return query
}

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} userIDs
 * @param {Date} date
 */
export function newMute(guild: Guild, userIDs: Array<string>, date: number) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs]
    }
    for (const userID of userIDs) {
        db.prepare("INSERT INTO moderation_mutes (user, unmute_time, guild_id) VALUES (?, ?, ?)").run(userID, date, guild.id)
    }
}

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} userIDs
 * @param {Date} date
 */
export function newBan(guild: Guild, userIDs: Array<string> | string, date: Date) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs]
    }

    for (const userID of userIDs) {
        db.prepare("INSERT INTO moderation_bans (user, unban_time, guild_id) VALUES (?, ?, ?)").run(userID, date, guild.id)
    }
}

/**
 * @returns {Boolean}
 * @param {Guild} guild
 * @param {GuildMember} member
 */
export function isMuted(guild: Guild, member: GuildMember): boolean {
    const query = db
        .prepare("SELECT user FROM moderation_mutes WHERE guild_id = ? AND user = ?")
        .get(guild.id, member.user.id)

    if (query) {
        return true
    } else {
        return false
    }
}

/**
 * @returns {Boolean}
 * @param {Guild} guild
 * @param {GuildMember} member
 */
export function isBanned(guild: Guild, member: GuildMember): boolean {
    const query = db
        .prepare("SELECT user FROM moderation_bans WHERE guild_id = ? AND user = ?")
        .get(guild.id, member.user.id)

    if (query) {
        return true
    } else {
        return false
    }
}

/**
 *
 * @param {Client} client
 */
export function runModerationChecks(client: Client) {
    setInterval(() => {
        const date = new Date().getTime()

        let query = db.prepare("SELECT user, guild_id FROM moderation_mutes WHERE unmute_time <= ?").all(date)

        for (const unmute of query) {
            logger.log({
                level: "auto",
                message: `requesting unmute in ${unmute.guild_id} for ${unmute.user}`,
            })
            requestUnmute(unmute.guild_id, unmute.user, client)
        }

        query = db.prepare("SELECT user, guild_id FROM moderation_bans WHERE unban_time <= ?").all(date)

        for (const unban of query) {
            logger.log({
                level: "auto",
                message: `requesting unban in ${unban.guild_id} for ${unban.user}`,
            })
            requestUnban(unban.guild_id, unban.user, client)
        }

        query = db.prepare("SELECT modlogs, id FROM moderation WHERE modlogs != ''").all()

        for (const modlog of query) {
            if (!modLogQueue.has(modlog.id) || modLogQueue.get(modlog.id).length == 0) continue
            let webhook: WebhookClient

            if (modLogHookCache.has(modlog.id)) {
                webhook = modLogHookCache.get(modlog.id)
            } else {
                webhook = new WebhookClient({ url: modlog.modlogs })
                modLogHookCache.set(modlog.id, webhook)
            }

            let embeds: CustomEmbed[]

            if (modLogQueue.get(modlog.id).length > 10) {
                embeds = modLogQueue.get(modlog.id).splice(0, 10)
            } else {
                embeds = modLogQueue.get(modlog.id)
            }

            webhook.send({ embeds: embeds }).catch((e) => {
                logger.error(`error sending modlogs to webhook (${modlog.id}) - removing modlogs`)
                logger.error(e)

                db.prepare("UPDATE moderation SET modlogs = '' WHERE id = ?").run(modlog.id)
            })
        }
    }, 30000)
}

/**
 *
 * @param {Guild} guild
 * @param {Number} caseID
 * @param {String} reason
 */
export function setReason(guild: Guild, caseID: number, reason: string) {
    db.prepare("UPDATE moderation_cases SET command = ? WHERE case_id = ? AND guild_id = ?").run(reason, caseID, guild.id)
}

export function deleteMute(guild: Guild, member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.id
    } else {
        id = member
    }

    db.prepare("DELETE FROM moderation_mutes WHERE user = ? AND guild_id = ?").run(id, guild.id)
}

export function deleteBan(guild: Guild, member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.id
    } else {
        id = member
    }

    db.prepare("DELETE FROM moderation_bans WHERE user = ? AND guild_id = ?").run(id, guild.id)
}
/**
 *
 * @param {Guild} guild
 * @returns {String}
 */
export function getMuteRole(guild: Guild): string {
    const query = db.prepare("SELECT mute_role FROM moderation WHERE id = ?").get(guild.id)

    if (query.mute_role == "") {
        return undefined
    } else {
        return query.mute_role
    }
}

/**
 *
 * @param {Guild} guild
 * @param {Role} role
 */
export function setMuteRole(guild: Guild, role: Role | string) {
    const query = db.prepare("UPDATE moderation SET mute_role = ? WHERE id = ?")

    if (role instanceof Role) {
        query.run(role.id, guild.id)
    } else {
        query.run(role, guild.id)
    }
}

function requestUnban(guild: string | Guild, member: string, client: Client) {
    guild = client.guilds.cache.find((g) => g.id == guild)

    if (!guild) {
        logger.warn("unable to find guild")
        return
    }

    deleteBan(guild, member)

    guild.members.unban(member, "ban expired")

    logger.log({
        level: "success",
        message: "ban removed",
    })
}

async function requestUnmute(guild: Guild | string, member: string, client: Client) {
    guild = client.guilds.cache.find((g) => g.id == guild)

    if (!guild) {
        logger.warn(`unable to find guild ${guild}`)
        return
    }

    let members

    if (inCooldown(guild)) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()

        addCooldown(guild, 3600)
    }

    let newMember = await members.find((m) => m.id == member)

    if (!newMember) {
        newMember = await guild.members.fetch(member).catch(() => {
            newMember = undefined
        })
        if (!newMember) {
            logger.warn("unable to find member, deleting mute..")
            return deleteMute(guild, member)
        }
    }

    await guild.roles.fetch()

    const muteRoleID = getMuteRole(guild)

    let muteRole = guild.roles.cache.find((r) => r.id == muteRoleID)

    if (!muteRoleID || muteRoleID == "") {
        muteRole = guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
    }

    if (!muteRole) {
        logger.warn("unable to find mute role, deleting mute..")
        return deleteMute(guild, newMember)
    }

    deleteMute(guild, member)

    logger.log({
        level: "success",
        message: "mute deleted",
    })

    return await newMember.roles.remove(muteRole).catch(() => {
        logger.error("couldnt remove mute role")
    })
}

export function getMutedUsers(guild: Guild): Array<{ user: string; unmute_time: number }> {
    const query = db.prepare("SELECT user, unmute_time FROM moderation_mutes WHERE guild_id = ?").all(guild.id)

    return query
}
