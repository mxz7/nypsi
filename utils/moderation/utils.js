const fs = require("fs")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { Guild, Message, GuildMember, Client } = require("discord.js")
const { info, types, getTimestamp } = require("../logger")
let data = JSON.parse(fs.readFileSync("./utils/moderation/data.json"))

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
}, 60000)

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

module.exports = {
    /**
     *
     * @param {Guild} guild guild to create profile for
     */
    createProfile: function (guild) {
        data[guild.id] = {
            caseCount: 0,
            cases: [],
            mutes: [],
        }
    },

    /**
     * @returns {Boolean}
     * @param {Guild} guild check if profile exists for this guild
     */
    profileExists: function (guild) {
        if (data[guild.id]) {
            return true
        } else {
            return false
        }
    },

    /**
     * @returns {Number}
     * @param {Guild} guild guild to get case count of
     */
    getCaseCount: function (guild) {
        return data[guild.id].caseCount
    },

    /**
     *
     * @param {Guild} guild guild to create new case in
     * @param {String} caseType mute, unmute, kick, warn, ban, unban
     * @param {Array<String>} userIDs list of user ids
     * @param {String} moderator moderator issuing punishment
     * @param {String} command entire message
     */
    newCase: function (guild, caseType, userIDs, moderator, command) {
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
    },

    /**
     *
     * @param {Guild} guild guild to delete case in
     * @param {String} caseID case to delete
     */
    deleteCase: function (guild, caseID) {
        const caseInfo = data[guild.id].cases[caseID]

        caseInfo.deleted = true

        data[guild.id].cases[caseID] = caseInfo
    },

    /**
     *
     * @param {Guild} guild guild to delete data for
     */
    deleteServer: function (guild) {
        delete data[guild.id]
    },

    /**
     * @returns {Array}
     * @param {Guild} guild guild to get cases of
     * @param {String} userID user to get cases of
     */
    getCases: function (guild, userID) {
        const cases = []

        for (let case0 of data[guild.id].cases) {
            if (case0.user == userID) {
                cases.push(case0)
            }
        }

        return cases.reverse()
    },

    /**
     * @returns {Object}
     * @param {Guild} guild guild to get cases of
     */
    getAllCases: function (guild) {
        return data[guild.id].cases
    },

    /**
     * @returns {JSON} case
     * @param {Guild} guild guild to search for case in
     * @param {Number} caseID case to fetch
     */
    getCase: function (guild, caseID) {
        return data[guild.id].cases[caseID]
    },

    /**
     *
     * @param {Guild} guild
     * @param {Array<String>} userIDs
     * @param {Date} date
     */
    newMute: function (guild, userIDs, date) {
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
    },

    /**
     *
     * @param {Guild} guild
     * @param {Guildmember} member
     */
    deleteMute: function (guild, member) {
        deleteMute(guild, member)
    },

    /**
     * @returns {Boolean}
     * @param {Guild} guild
     * @param {GuildMember} member
     */
    isMuted: function (guild, member) {
        const currentMutes = data[guild.id].mutes

        for (let mute of currentMutes) {
            if (mute.user == member.user.id) {
                return true
            }
        }

        return false
    },

    /**
     *
     * @param {Client} client
     */
    runUnmuteChecks: function (client) {
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
            }
        }, 120000)
    },

    /**
     * @returns {JSON}
     * @param {Guild} guild
     */
    getMutes: function (guild) {
        return data[guild.id].mutes
    },

    /**
     *
     * @param {Guild} guild
     * @param {Number} caseID
     * @param {String} reason
     */
    setReason: function (guild, caseID, reason) {
        const currentCase = data[guild.id].cases[caseID]

        currentCase.command = reason

        data[guild.id].cases[caseID] = currentCase
    },
}

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

    const newMember = members.find((m) => m.id == member)

    if (!newMember) {
        return deleteMute(guild, member)
    }

    const muteRole = guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")

    if (!muteRole) return deleteMute(guild, newMember)

    deleteMute(guild, member)

    return await member.roles.remove(muteRole).catch()
}
