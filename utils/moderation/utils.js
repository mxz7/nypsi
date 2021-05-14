const fs = require("fs")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { Guild, Message, GuildMember, Client, Role } = require("discord.js")
const { info, types, getTimestamp, error } = require("../logger")
const { getDatabase } = require("../database/database")
let data = JSON.parse(fs.readFileSync("./utils/moderation/data.json"))
info(
    `${Array.from(Object.keys(data)).length.toLocaleString()} moderation guilds loaded`,
    types.DATA
)

const db = getDatabase()

let timer = 0
let timerCheck = true
setInterval(() => {
    const data1 = JSON.parse(fs.readFileSync("./utils/moderation/data.json"))

    if (JSON.stringify(data) != JSON.stringify(data1)) {
        fs.writeFile("./utils/moderation/data.json", JSON.stringify(data), (err) => {
            if (err) {
                return console.log(err)
            }
            info("moderation data saved", types.DATA)
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        data = JSON.parse(fs.readFileSync("./utils/moderation/data.json"))
        info("moderation data refreshed", types.DATA)
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        data = JSON.parse(fs.readFileSync("./utils/moderation/data.json"))
        info("moderation data refreshed", types.DATA)
        timer = 0
    }
}, 60000 + Math.floor(Math.random() * 60) * 1000)

setInterval(async () => {
    const { checkGuild } = require("../../nypsi")

    for (let guild in data) {
        const exists = await checkGuild(guild)

        if (!exists) {
            delete data[guild]

            info(`deleted guild '${guild}' from moderation data`, types.GUILD)
        }
    }
}, 24 * 60 * 60 * 1000)

setInterval(() => {
    let date = new Date()
    date =
        getTimestamp().split(":").join(".") +
        " - " +
        date.getDate() +
        "." +
        date.getMonth() +
        "." +
        date.getFullYear()
    fs.writeFileSync("./utils/moderation/backup/" + date + ".json", JSON.stringify(data))
    info("moderation data backup complete", types.DATA)
}, 43200000 * 2)

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
    const query = db.prepare("SELECT * FROM moderation WHERE id = ?").get(guild.id)

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
        db.prepare("INSERT INTO moderation_cases (case_id, type, user, moderator, command, time, deleted, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(caseCount.toString(), caseType, userID, moderator, command, new Date().getTime(), 0, guild.id)
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
    db.prepare("UPDATE moderation_cases SET deleted = 1 WHERE guild_id = ? AND case_id = ?").run(guild.id, caseID)
}

exports.deleteCase = deleteCase

/**
 *
 * @param {Guild} guild guild to delete data for
 */
function deleteServer(guild) {
    db.prepare("DELETE FROM moderation_cases WHERE guild_id = ?").run(guild.id)
    db.prepare("DELETE FROM moderation_mutes WHERE guild_id = ?").run(guild.id)
    db.prepare("DELETE FROM moderation_bans WHERE guild_id = ?").run(guild.id)
    db.prepare("DELETE FROM moderation WHERE id = ?").run(guild.id)
}

exports.deleteServer = deleteServer

/**
 * @returns {Array}
 * @param {Guild} guild guild to get cases of
 * @param {String} userID user to get cases of
 */
function getCases(guild, userID) {
    const query = db.prepare("SELECT * FROM moderation_cases WHERE guild_id = ? AND user = ?").all(guild.id, userID)

    return query.reverse()
}

exports.getCases = getCases

/**
 * @returns {Object}
 * @param {Guild} guild guild to get cases of
 */
function getAllCases(guild) {
    const query = db.prepare("SELECT user, moderator FROM moderation_cases WHERE guild_id = ?").all(guild.id)

    return query.reverse()
}

exports.getAllCases = getAllCases

/**
 * @returns {JSON} case
 * @param {Guild} guild guild to search for case in
 * @param {Number} caseID case to fetch
 */
function getCase(guild, caseID) {
    const query = db.prepare("SELECT * FROM moderation_cases WHERE guild_id = ? AND case_id = ?").get(guild.id, caseID)
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
    const query = db.prepare("SELECT user FROM moderation_mutes WHERE guild_id = ? AND user = ?").get(guild.id, member.user.id)

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

        let query = db.prepare("SELECT user, guild_id FROM moderation_mutes WHERE unmute_time <= ?")

        for (let unmute of query.iterate(date)) {
            requestUnmute(unmute.guild_id, unmute.user, client)
            info(`requested unmute in ${unmute.guild_id} for ${unmute.user}`, types.AUTOMATION)
        }

        query = db.prepare("SELECT user, guild_id FROM moderation_bans WHERE unban_time <= ?")

        for (let unban of query.iterate(date)) {
            requestUnmute(unban.guild_id, unban.user, client)
            info(`requested unmute in ${unban.guild_id} for ${unban.user}`, types.AUTOMATION)
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
    const currentCase = data[guild.id].cases[caseID]
    currentCase.command = reason
    data[guild.id].cases[caseID] = currentCase
}

exports.setReason = setReason

function deleteMute(guild, member) {
    let id = member.id

    if (!id) {
        id = member
    }

    const currentMutes = data[guild.id].mutes

    for (let mute of currentMutes) {
        if (mute.user == id) {
            currentMutes.splice(currentMutes.indexOf(mute), 1)
        }
    }

    data[guild.id].mutes = currentMutes
}

exports.deleteMute = deleteMute

function deleteBan(guild, member) {
    let id = member.id

    if (!id) {
        id = member
    }

    const currentBans = data[guild.id].bans

    for (let ban of currentBans) {
        if (ban.user == id) {
            currentBans.splice(currentBans.indexOf(ban), 1)
        }
    }

    data[guild.id].bans = currentBans
}

exports.deleteBan = deleteBan

/**
 *
 * @param {Guild} guild
 * @returns {String}
 */
function getMuteRole(guild) {
    if (!data[guild.id]) return undefined
    if (!data[guild.id].muteRole) return undefined
    return data[guild.id].muteRole
}

exports.getMuteRole = getMuteRole

/**
 *
 * @param {Guild} guild
 * @param {Role} role
 */
function setMuteRole(guild, role) {
    if (role == "default") {
        data[guild.id].muteRole = ""
    } else {
        data[guild.id].muteRole = role.id
    }
}

exports.setMuteRole = setMuteRole

function requestUnban(guild, member, client) {
    guild = client.guilds.cache.find((g) => g.id == guild)

    if (!guild) return

    deleteBan(guild, member)

    guild.members.unban(member, "ban expired")
}

async function requestUnmute(guild, member, client) {
    guild = client.guilds.cache.find((g) => g.id == guild)

    if (!guild) return

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
            return deleteMute(guild, member)
        }
    }

    await guild.roles.fetch()

    let muteRole = await guild.roles.cache.find((r) => r.id == data[guild.id].muteRole)

    if (data[guild.id].muteRole == "") {
        muteRole = await guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
    }

    if (!muteRole) return deleteMute(guild, newMember)

    deleteMute(guild, member)

    try {
        return await newMember.roles.remove(muteRole).catch((e) => {
            error(newMember)
            error(e + " hahaha")
        })
    } catch (e) {
        error(newMember)
        error(e + " hahaha")
    }
}
