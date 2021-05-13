const fs = require("fs")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { Guild, Message, GuildMember, Client, Role } = require("discord.js")
const { info, types, getTimestamp, error } = require("../logger")
let data = JSON.parse(fs.readFileSync("./utils/moderation/data.json"))
info(
    `${Array.from(Object.keys(data)).length.toLocaleString()} moderation guilds loaded`,
    types.DATA
)

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
    data[guild.id] = {
        caseCount: 0,
        muteRole: "",
        cases: [],
        mutes: [],
        bans: [],
    }
}

exports.createProfile = createProfile

/**
 * @returns {Boolean}
 * @param {Guild} guild check if profile exists for this guild
 */
function profileExists(guild) {
    if (data[guild.id]) {
        return true
    } else {
        return false
    }
}

exports.profileExists = profileExists

/**
 * @returns {Number}
 * @param {Guild} guild guild to get case count of
 */
function getCaseCount(guild) {
    return data[guild.id].caseCount
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
        const currentCases = data[guild.id].cases
        const count = data[guild.id].caseCount
        const case0 = {
            id: count,
            type: caseType,
            user: userID,
            moderator: moderator,
            command: command,
            time: new Date().getTime(),
            deleted: false,
        }
        currentCases.push(case0)
        data[guild.id].cases = currentCases
        data[guild.id].caseCount = count + 1
    }
}

exports.newCase = newCase

/**
 *
 * @param {Guild} guild guild to delete case in
 * @param {String} caseID case to delete
 */
function deleteCase(guild, caseID) {
    const caseInfo = data[guild.id].cases[caseID]
    caseInfo.deleted = true
    data[guild.id].cases[caseID] = caseInfo
}

exports.deleteCase = deleteCase

/**
 *
 * @param {Guild} guild guild to delete data for
 */
function deleteServer(guild) {
    delete data[guild.id]
}

exports.deleteServer = deleteServer

/**
 * @returns {Array}
 * @param {Guild} guild guild to get cases of
 * @param {String} userID user to get cases of
 */
function getCases(guild, userID) {
    const cases = []
    for (let case0 of data[guild.id].cases) {
        if (case0.user == userID) {
            cases.push(case0)
        }
    }
    return cases.reverse()
}

exports.getCases = getCases

/**
 * @returns {Object}
 * @param {Guild} guild guild to get cases of
 */
function getAllCases(guild) {
    return data[guild.id].cases
}

exports.getAllCases = getAllCases

/**
 * @returns {JSON} case
 * @param {Guild} guild guild to search for case in
 * @param {Number} caseID case to fetch
 */
function getCase(guild, caseID) {
    return data[guild.id].cases[caseID]
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
        const currentMutes = data[guild.id].mutes
        const d = {
            user: userID,
            unmuteTime: date,
        }
        currentMutes.push(d)
        data[guild.id].mutes = currentMutes
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
        const currentBans = data[guild.id].bans
        const d = {
            user: userID,
            unbanTime: date,
        }
        currentBans.push(d)
        data[guild.id].bans = currentBans
    }
}

exports.newBan = newBan

/**
 * @returns {Boolean}
 * @param {Guild} guild
 * @param {GuildMember} member
 */
function isMuted(guild, member) {
    const currentMutes = data[guild.id].mutes
    for (let mute of currentMutes) {
        if (mute.user == member.user.id) {
            return true
        }
    }
    return false
}

exports.isMuted = isMuted

/**
 * @returns {Boolean}
 * @param {Guild} guild
 * @param {GuildMember} member
 */
function isBanned(guild, member) {
    const currentBans = data[guild.id].bans
    for (let ban of currentBans) {
        if (ban.user == member.user.id) {
            return true
        }
    }
    return false
}

exports.isBanned = isBanned

/**
 *
 * @param {Client} client
 */
function runModerationChecks(client) {
    setInterval(() => {
        const date = new Date().getTime()
        for (let guild in data) {
            const mutes = data[guild].mutes
            if (mutes.length > 0) {
                for (let mute of mutes) {
                    if (mute.unmuteTime <= date) {
                        requestUnmute(guild, mute.user, client)
                        info(`requested unmute in ${guild} for ${mute.user}`, types.AUTOMATION)
                    }
                }
            }
            const bans = data[guild].bans
            if (bans.length > 0) {
                for (let ban of bans) {
                    if (ban.unbanTime <= date) {
                        requestUnban(guild, ban.user, client)
                        info(`requested unban in ${guild} for ${ban.user}`, types.AUTOMATION)
                    }
                }
            }
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
