import { Client, Guild, GuildMember, Role } from "discord.js"
import { getDatabase } from "../database/database"
import { addCooldown, inCooldown } from "../guilds/utils"
import { logger } from "../logger"
import { Case } from "../models/GuildStorage"

declare function require(name: string)

const db = getDatabase()

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
    caseType: string,
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
    }
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
export function getAllCases(guild: Guild): object {
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
export function newMute(guild: Guild, userIDs: Array<string>, date: Date) {
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
        query.run("", guild.id)
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
