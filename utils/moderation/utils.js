const { inCooldown, addCooldown } = require("../guilds/utils")
const { Guild, GuildMember, Client, Role } = require("discord.js")
const { logger } = require("../logger")
const { getDatabase } = require("../database/database")

const db = getDatabase()

setInterval(async () => {
    const { checkGuild } = require("../../nypsi")

    const query = db.prepare("SELECT id FROM moderation").all()

    for (let guild of query) {
        const exists = await checkGuild(guild.id)

        if (!exists) {
            deleteServer(guild)

            logger.guild(`deleted guild '${guild.id}' from moderation data`)
        }
    }
}, 24 * 60 * 60 * 1000)

/**
 *
 * @param {Guild} guild guild to create profile for
 */
function createProfile(guild) {
    db.prepare("INSERT INTO moderation (id) VALUES (?)").run(guild.id)
}

exports.createProfile = createProfile

/**
 * @returns {Boolean}
 * @param {Guild} guild check if profile exists for this guild
 */
function profileExists(guild) {
    const query = db.prepare("SELECT id FROM moderation WHERE id = ?").get(guild.id)

    if (!query) {
        return false
    } else {
        return true
    }
}

exports.profileExists = profileExists

/**
 * @returns {Number}
 * @param {Guild} guild guild to get case count of
 */
function getCaseCount(guild) {
    const query = db.prepare("SELECT case_count FROM moderation WHERE id = ?").get(guild.id)

    return query.case_count
}

exports.getCaseCount = getCaseCount

/**
 *
 * @param {Guild} guild guild to create new case in
 * @param {String} caseType mute, unmute, kick, warn, ban, unban
 * @param {Array<String>} userIDs list of user ids
 * @param {String} moderator moderator issuing punishment
 * @param {String} command entire message
 */
function newCase(guild, caseType, userIDs, moderator, command) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs]
    }
    for (let userID of userIDs) {
        const caseCount = getCaseCount(guild)
        db.prepare(
            "INSERT INTO moderation_cases (case_id, type, user, moderator, command, time, deleted, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(caseCount.toString(), caseType, userID, moderator, command, new Date().getTime(), 0, guild.id)
        db.prepare("UPDATE moderation SET case_count = ? WHERE id = ?").run(caseCount + 1, guild.id)
    }
}

exports.newCase = newCase

/**
 *
 * @param {Guild} guild guild to delete case in
 * @param {String} caseID case to delete
 */
function deleteCase(guild, caseID) {
    db.prepare("UPDATE moderation_cases SET deleted = 1 WHERE guild_id = ? AND case_id = ?").run(guild.id, caseID.toString())
}

exports.deleteCase = deleteCase

/**
 *
 * @param {Guild} guild guild to delete data for
 */
function deleteServer(guild) {
    let id

    if (!guild.id) {
        id = guild
    } else {
        id = guild.id
    }

    db.prepare("DELETE FROM moderation_cases WHERE guild_id = ?").run(id)
    db.prepare("DELETE FROM moderation_mutes WHERE guild_id = ?").run(id)
    db.prepare("DELETE FROM moderation_bans WHERE guild_id = ?").run(id)
    db.prepare("DELETE FROM moderation WHERE id = ?").run(id)
}

exports.deleteServer = deleteServer

/**
 * @returns {Array}
 * @param {Guild} guild guild to get cases of
 * @param {String} userID user to get cases of
 */
function getCases(guild, userID) {
    const query = db.prepare("SELECT * FROM moderation_cases WHERE guild_id = ? AND user = ?").all(guild.id, userID)

    for (const d of query) {
        d.case_id = parseInt(d.case_id)
    }

    return query.reverse()
}

exports.getCases = getCases

/**
 * @returns {Object}
 * @param {Guild} guild guild to get cases of
 */
function getAllCases(guild) {
    const query = db.prepare("SELECT user, moderator, type, deleted FROM moderation_cases WHERE guild_id = ?").all(guild.id)

    return query.reverse()
}

exports.getAllCases = getAllCases

/**
 * @returns {JSON} case
 * @param {Guild} guild guild to search for case in
 * @param {Number} caseID case to fetch
 */
function getCase(guild, caseID) {
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

exports.getCase = getCase

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} userIDs
 * @param {Date} date
 */
function newMute(guild, userIDs, date) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs]
    }
    for (let userID of userIDs) {
        db.prepare("INSERT INTO moderation_mutes (user, unmute_time, guild_id) VALUES (?, ?, ?)").run(userID, date, guild.id)
    }
}

exports.newMute = newMute

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} userIDs
 * @param {Date} date
 */
function newBan(guild, userIDs, date) {
    if (!(userIDs instanceof Array)) {
        userIDs = [userIDs]
    }

    for (let userID of userIDs) {
        db.prepare("INSERT INTO moderation_bans (user, unban_time, guild_id) VALUES (?, ?, ?)").run(userID, date, guild.id)
    }
}

exports.newBan = newBan

/**
 * @returns {Boolean}
 * @param {Guild} guild
 * @param {GuildMember} member
 */
function isMuted(guild, member) {
    const query = db
        .prepare("SELECT user FROM moderation_mutes WHERE guild_id = ? AND user = ?")
        .get(guild.id, member.user.id)

    if (query) {
        return true
    } else {
        return false
    }
}

exports.isMuted = isMuted

/**
 * @returns {Boolean}
 * @param {Guild} guild
 * @param {GuildMember} member
 */
function isBanned(guild, member) {
    const query = db
        .prepare("SELECT user FROM moderation_bans WHERE guild_id = ? AND user = ?")
        .get(guild.id, member.user.id)

    if (query) {
        return true
    } else {
        return false
    }
}

exports.isBanned = isBanned

/**
 *
 * @param {Client} client
 */
function runModerationChecks(client) {
    setInterval(() => {
        const date = new Date().getTime()

        let query = db.prepare("SELECT user, guild_id FROM moderation_mutes WHERE unmute_time <= ?").all(date)

        for (let unmute of query) {
            logger.auto(`requesting unmute in ${unmute.guild_id} for ${unmute.user}`)
            requestUnmute(unmute.guild_id, unmute.user, client)
        }

        query = db.prepare("SELECT user, guild_id FROM moderation_bans WHERE unban_time <= ?").all(date)

        for (let unban of query) {
            logger.auto(`requesting unban in ${unban.guild_id} for ${unban.user}`)
            requestUnban(unban.guild_id, unban.user, client)
        }
    }, 30000)
}

exports.runModerationChecks = runModerationChecks

/**
 *
 * @param {Guild} guild
 * @param {Number} caseID
 * @param {String} reason
 */
function setReason(guild, caseID, reason) {
    db.prepare("UPDATE moderation_cases SET command = ? WHERE case_id = ? AND guild_id = ?").run(reason, caseID, guild.id)
}

exports.setReason = setReason

function deleteMute(guild, member) {
    let id = member.id

    if (!id) {
        id = member
    }

    db.prepare("DELETE FROM moderation_mutes WHERE user = ? AND guild_id = ?").run(id, guild.id)
}

exports.deleteMute = deleteMute

function deleteBan(guild, member) {
    let id = member.id

    if (!id) {
        id = member
    }

    db.prepare("DELETE FROM moderation_bans WHERE user = ? AND guild_id = ?").run(id, guild.id)
}

exports.deleteBan = deleteBan

/**
 *
 * @param {Guild} guild
 * @returns {String}
 */
function getMuteRole(guild) {
    const query = db.prepare("SELECT mute_role FROM moderation WHERE id = ?").get(guild.id)

    if (query.mute_role == "") {
        return undefined
    } else {
        return query.mute_role
    }
}

exports.getMuteRole = getMuteRole

/**
 *
 * @param {Guild} guild
 * @param {Role} role
 */
function setMuteRole(guild, role) {
    const query = db.prepare("UPDATE moderation SET mute_role = ? WHERE id = ?")

    if (role == "default") {
        query.run("", guild.id)
    } else {
        query.run(role.id, guild.id)
    }
}

exports.setMuteRole = setMuteRole

function requestUnban(guild, member, client) {
    guild = client.guilds.cache.find((g) => g.id == guild)

    if (!guild) {
        logger.warn("unable to find guild")
        return
    }

    deleteBan(guild, member)

    guild.members.unban(member, "ban expired")

    logger.success("ban removed")
}

async function requestUnmute(guild, member, client) {
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

    let muteRole = await guild.roles.cache.find((r) => r.id == muteRoleID)

    if (!muteRoleID || muteRoleID == "") {
        muteRole = await guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
    }

    if (!muteRole) {
        logger.warn("unable to find mute role, deleting mute..")
        return deleteMute(guild, newMember)
    }

    deleteMute(guild, member)

    logger.success("mute deleted")

    return await newMember.roles.remove(muteRole).catch(() => {
        logger.error("couldnt remove mute role")
    })
}
