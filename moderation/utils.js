const fs = require("fs")
const { getTimestamp } = require("../utils/utils")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { Guild, Message, GuildMember, Client } = require("discord.js")
let data = JSON.parse(fs.readFileSync("./moderation/data.json"))

let timer = 0
let timerCheck = true
setInterval(() => {
    const data1 = JSON.parse(fs.readFileSync("./moderation/data.json"))

    if (JSON.stringify(data) != JSON.stringify(data1)) {
        fs.writeFile("./moderation/data.json", JSON.stringify(data), (err) => {
            if (err) {
                return console.log(err)
            }
            console.log("\x1b[32m[" + getTimestamp() + "] moderation data saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        data = JSON.parse(fs.readFileSync("./moderation/data.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] moderation data refreshed\x1b[37m")
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        data = JSON.parse(fs.readFileSync("./moderation/data.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] moderation data refreshed\x1b[37m")
        timer = 0
    }
}, 60000)

setInterval(async () => {
    const { checkGuild } = require("../nypsi")
    
    for (guild in data) {
        const exists = await checkGuild(guild)

        if (!exists) {
            delete data[guild]

            console.log(`[${getTimestamp()}] deleted guild '${guild}' from guilds.json`)
        }
    }

}, 24 * 60 * 60 * 1000);

module.exports = {

    /**
     * 
     * @param {Guild} guild guild to create profile for
     */
    createProfile: function(guild) {
        data[guild.id] = {
            caseCount: 0,
            cases: [],
            mutes: []
        }
    },

    /**
     * @returns {Boolean}
     * @param {Guild} guild check if profile exists for this guild
     */
    profileExists: function(guild) {
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
    getCaseCount: function(guild) {
        return data[guild.id].caseCount
    },

    /**
     * 
     * @param {Number} guild guild to create new case in
     * @param {String} caseType mute, unmute, kick, warn, ban, unban
     * @param {String} userID id of user being punished
     * @param {String} moderator moderator issuing punishment
     * @param {Message} command entire message
     */
    newCase: function(guild, caseType, userID, moderator, command) {
        const currentCases = data[guild.id].cases
        const count = data[guild.id].caseCount

        const case0 = {
            id: count,
            type: caseType,
            user: userID,
            moderator: moderator,
            command: command,
            time: new Date().getTime(),
            deleted: false
        }

        currentCases.push(case0)

        data[guild.id].cases = currentCases
        data[guild.id].caseCount = count + 1
    },

    /**
     * 
     * @param {Guild} guild guild to delete case in
     * @param {String} caseID case to delete
     */
    deleteCase: function(guild, caseID) {
        const caseInfo = data[guild.id].cases[caseID]

        caseInfo.deleted = true

        data[guild.id].cases[caseID] = caseInfo
    },

    /**
     * 
     * @param {Guild} guild guild to delete data for
     */
    deleteServer: function(guild) {
        delete data[guild.id]
    },

    /**
     * @returns {Array}
     * @param {Guild} guild guild to get cases of
     * @param {String} userID user to get cases of
     */
    getCases: function(guild, userID) {
        const cases = []

        for (case0 of data[guild.id].cases) {
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
    getAllCases: function(guild) {
        return data[guild.id].cases
    },

    /**
     * @returns {JSON} case
     * @param {Guild} guild guild to search for case in
     * @param {Number} caseID case to fetch
     */
    getCase: function(guild, caseID) {
        return data[guild.id].cases[caseID]
    },

    /**
     * 
     * @param {Guild} guild 
     * @param {GuildMember} member 
     * @param {Date} date 
     */
    newMute: function(guild, member, date) {
        const currentMutes = data[guild.id].mutes

        const d = {
            user: member.user.id,
            unmuteTime: date
        }

        currentMutes.push(d)

        data[guild.id].mutes = currentMutes
    },

    /**
     * 
     * @param {Guild} guild 
     * @param {Guildmember} member 
     */
    deleteMute: function(guild, member) {
        deleteMute(guild, member)
    },

    /**
     * @returns {Boolean}
     * @param {Guild} guild 
     * @param {GuildMember} member 
     */
    isMuted: function(guild, member) {
        const currentMutes = data[guild.id].mutes

        for (mute of currentMutes) {
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
    runUnmuteChecks: function(client) {
        setInterval(() => {
            const date = new Date().getTime()
        
            for (guild in data) {
                const mutes = data[guild].mutes
        
                if (mutes.length > 0) {
                    for (mute of mutes) {
                        if (mute.unmuteTime <= date) {
                            requestUnmute(guild, mute.user, client)
                        }
                    }
                }
            }
        
        }, 120000)
    },

    /**
     * 
     * @param {Guild} guild 
     * @param {Number} caseID 
     * @param {String} reason 
     */
    setReason: function(guild, caseID, reason) {
        const currentCase = data[guild.id].cases[caseID]

        currentCase.command = reason

        data[guild.id].cases[caseID] = currentCase
    }
}

function deleteMute(guild, member) {
    const currentMutes = data[guild.id].mutes

    for (mute of currentMutes) {
        if (mute.user == member.user.id) {
            currentMutes.splice(currentMutes.indexOf(mute), 1)
        }
    }

    data[guild.id].mutes = currentMutes
}

async function requestUnmute(guild, member, client) {
    guild = client.guilds.cache.find(g => g.id == guild)

    if (!guild) return 

    let members

    if (inCooldown(guild)) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()

        addCooldown(guild, 3600)
    }

    member = members.find(m => m.id == member)

    if (!member) return

    const muteRole = guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

    if (!muteRole) return deleteMute(guild, member)

    deleteMute(guild, member)

    return await member.roles.remove(muteRole).catch()
}