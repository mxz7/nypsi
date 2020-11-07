const { Guild } = require("discord.js")
const fs = require("fs")
const { getPriority } = require("os")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { GuildStorage } = require("../utils/classes/GuildStorage")
const { daysUntilChristmas } = require("../utils/utils")
let guilds = JSON.parse(fs.readFileSync("./guilds/data.json"))

let timer = 0
let timerCheck = true
setInterval(() => {
    const guilds1 = JSON.parse(fs.readFileSync("./guilds/data.json"))

    if (JSON.stringify(guilds) != JSON.stringify(guilds1)) {

        fs.writeFile("./guilds/data.json", JSON.stringify(guilds), (err) => {
            if (err) {
                return console.log(err)
            }
            console.log("\x1b[32m[" + getTimestamp() + "] guilds saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 10 && !timerCheck) {
        guilds = JSON.parse(fs.readFileSync("./guilds/data.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] guild data refreshed\x1b[37m")
        timerCheck = true
        timer = 0
    }
}, 120000)

setInterval(async () => {
    const { snipe, eSnipe } = require("../nypsi")

    const now = new Date().getTime()

    let snipeCount = 0
    let eSnipeCount = 0

    await snipe.forEach(msg => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            snipe.delete(msg.channel.id)
            snipeCount++
        }
    })

    if (snipeCount > 0) {
        console.log("[" + getTimestamp() + "] deleted " + snipeCount.toLocaleString() + " sniped messages")
    }

    await eSnipe.forEach(msg => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            eSnipe.delete(msg.channel.id)
            eSnipeCount++
        }
    })

    if (eSnipeCount > 0) {
        console.log("[" + getTimestamp() + "] deleted " + eSnipeCount.toLocaleString() + " edit sniped messages")
    }

}, 3600000)

setInterval(async () => {

    const { checkGuild } = require("../nypsi")
    
    for (let guild in guilds) {
        const exists = await checkGuild(guild)

        if (!exists) {
            delete guilds[guild]

            console.log(`[${getTimestamp()}] deleted guild '${guild}' from guilds data`)
        }
    }

}, 24 * 60 * 60 * 1000)

const fetchCooldown = new Set()
const checkCooldown = new Set()

/**
 * 
 * @param {Guild} guild run check for guild
 */
async function runCheck(guild) {
    if (checkCooldown.has(guild.id)) return

    checkCooldown.add(guild.id)

    setTimeout(() => {
        checkCooldown.delete(guild.id)
    }, 60 * 1000)

    if (!hasGuild(guild)) createGuild(guild)

    const currentMembersPeak = guilds[guild.id].peaks.members

    if (guild.memberCount > currentMembersPeak) {
        guilds[guild.id].peaks.members = guild.memberCount
        console.log("[" + getTimestamp() + "] members peak updated for '" + guild.name + "' " + currentMembersPeak + " -> " + guild.memberCount)
    }
}

exports.runCheck = runCheck

/**
 * @returns {Boolean}
 * @param {Guild} guild 
 */
function hasGuild(guild) {
    if (guilds[guild.id]) {
        return true
    } else {
        return false
    }
}

exports.hasGuild = hasGuild

/**
 * @returns {JSON}
 * @param {Guild} guild 
 */
function getPeaks(guild) {
    return guilds[guild.id].peaks
}

exports.getPeaks = getPeaks

/**
 * 
 * @param {Guild} guild create guild profile
 */
function createGuild(guild) {
    const members = guild.members.cache.filter(member => !member.user.bot)

    guilds[guild.id] = new GuildStorage(members.size, 0)
}

exports.createGuild = createGuild

/**
 * @param {Guild} guild get snipe filter
 * @returns {Array<String>}
 */
function getSnipeFilter(guild) {
    return guilds[guild.id].snipeFilter
}

exports.getSnipeFilter = getSnipeFilter

/**
 * 
 * @param {Guild} guild 
 * @param {Array<String>} array 
 */
function updateFilter(guild, array) {
    guilds[guild.id].snipeFilter = array
}

exports.updateFilter = updateFilter

/**
 * @returns {Boolean}
 * @param {Guild} guild 
 */
function hasStatsEnabled(guild) {
    if (guilds[guild.id].counter.enabled == true) {
        return true
    } else {
        return false
    }
}

exports.hasStatsEnabled = hasStatsEnabled

/**
 * 
 * @param {Guild} guild 
 */
function createDefaultStatsProfile(guild) {
    guilds[guild.id].counter = {
        enabled: false,
        format: "members: %count% (%peak%)",
        filterBots: true,
        channel: "none"
    }
}

exports.createDefaultStatsProfile = createDefaultStatsProfile

/**
 * @returns {JSON}
 * @param {Guild} guild 
 */
function getStatsProfile(guild) {
    return guilds[guild.id].counter
}

exports.getStatsProfile = getStatsProfile

/**
 * 
 * @param {Guild} guild 
 * @param {JSON} profile 
 */
function setStatsProfile(guild, profile) {
    guilds[guild.id].counter = profile
}

exports.setStatsProfile = setStatsProfile

/**
 * @returns {Array<JSON>}
 */
function getGuilds() {
    const guilds1 = []

    for (let g in guilds) {
        guilds1.push(g)
    }
    return guilds1
}

exports.getGuilds = getGuilds

/**
 * 
 * @param {Guild} guild 
 */
async function checkStats(guild) {
    let memberCount

    if (guilds[guild.id].counter.filterBots && guild.memberCount >= 25000) {
        guilds[guild.id].counter.filterBots = false
        memberCount = guild.memberCount
    } else if (guilds[guild.id].counter.filterBots) {

        let members

        if (inCooldown(guild) || guild.memberCount == guild.members.cache.size || guild.memberCount <= 50) {
            members = guild.members.cache
        } else {
            members = await guild.members.fetch().catch(() => {})
            addCooldown(guild, 3600)
        }

        members = members.filter(m => !m.user.bot)

        memberCount = members.size
    } else {
        memberCount = guild.memberCount
    }

    if (!memberCount) memberCount = guild.memberCount

    const channel = guild.channels.cache.find(c => c.id == guilds[guild.id].counter.channel)

    if (!channel) {
        guilds[guild.id].counter.enabled = false
        guilds[guild.id].counter.channel = "none"
        return
    }

    let format = guilds[guild.id].counter.format
    format = format.split("%count%").join(memberCount.toLocaleString())
    format = format.split("%peak%").join(guilds[guild.id].peaks.members)

    if (channel.name != format) {
        const old = channel.name

        await channel.edit({name: format}).then(() => {
            console.log("[" + getTimestamp() + "] counter updated for '" + guild.name + "' ~ '" + old + "' -> '" + format + "'")
        }).catch(() => {
            console.log("[" + getTimestamp() + "] error updating counter in " + guild.name)
            guilds[guild.id].counter.enabled = false
            guilds[guild.id].counter.channel = "none"
        })
    }
}

exports.checkStats = checkStats

/**
 * 
 * @param {Guild} guild 
 * @param {Number} seconds 
 */
function addCooldown(guild, seconds) {
    fetchCooldown.add(guild.id)

    setTimeout(() => {
        fetchCooldown.delete(guild.id)
    }, seconds * 1000)
}

exports.addCooldown = addCooldown

/**
 * @returns {Boolean}
 * @param {Guild} guild 
 */
function inCooldown(guild) {
    if (guild.memberCount <= 50 || guild.memberCount >= 25000) return true

    if (fetchCooldown.has(guild.id)) {
        return true
    } else {
        return false
    }
}

exports.inCooldown = inCooldown

/**
 * @returns {String}
 * @param {Guild} guild 
 */
function getPrefix(guild) {
    try {
        return guilds[guild.id].prefix
    } catch (e) {
        console.log("[" + getTimestamp() + "] couldn't fetch prefix for server " + guild.id)
        return "$"
    }
}

exports.getPrefix = getPrefix

/**
 * 
 * @param {Guild} guild 
 * @param {String} prefix 
 */
function setPrefix(guild, prefix) {
    guilds[guild.id].prefix = prefix
}

exports.setPrefix = setPrefix

/**
 * @returns {Boolean}
 * @param {Guild} guild 
 */
function hasChristmasCountdown(guild) {
    if (!guilds[guild.id].xmas) {
        return false
    } else {
        return true
    }
}

exports.hasChristmasCountdown = hasChristmasCountdown

function createNewChristmasCountdown(guild) {
    guilds[guild.id].xmas = {
        enabled: false,
        format: "`%days%` days until christmas",
        channel: "none"
    }
}

exports.createNewChristmasCountdown = createNewChristmasCountdown

/**
 * @returns {JSON}
 * @param {Guild} guild 
 */
function getChristmasCountdown(guild) {
    return guilds[guild.id].xmas
}

exports.getChristmasCountdown = getChristmasCountdown

/**
 * 
 * @param {Guild} guild 
 * @param {JSON} xmas 
 */
function setChristmasCountdown(guild, xmas) {
    guilds[guild.id].xmas = xmas
}

exports.setChristmasCountdown = setChristmasCountdown

/**
 * @returns {Boolean}
 * @param {Guild} guild 
 */
function hasChristmasCountdownEnabled(guild) {
    if (!hasChristmasCountdown(guild)) return false

    if (guilds[guild.id].xmas.enabled == true) {
        return true
    } else {
        return false
    }
}

exports.hasChristmasCountdownEnabled = hasChristmasCountdownEnabled

/**
 * 
 * @param {Guild} guild 
 */
async function checkChristmasCountdown(guild) {
    const channel = guild.channels.cache.find(c => c.id == guilds[guild.id].xmas.channel)

    if (!channel) {
        guilds[guild.id].xmas.enabled = false
        guilds[guild.id].xmas.channel = "none"
        return
    }

    let format = guilds[guild.id].xmas.format

    const days = daysUntilChristmas()

    format = format.split("%days%").join(daysUntilChristmas().toString())

    if (days == "ITS CHRISTMAS") {
        format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO"
    }

    await channel.send(new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")).then(() => {
        console.log(`[${getTimestamp()}] sent christmas countdown in ${guild.name} ~ ${format}`)
    }).catch(() => {
        console.log(`[${getTimestamp()}] error sending christmas countdown in ${guild.name}`)
        guilds[guild.id].xmas.enabled = false
        guilds[guild.id].xmas.channel = "none"
        return
    })
}

exports.checkChristmasCountdown = checkChristmasCountdown

/**
 * @param {Guild} guild get snipe filter
 * @returns {Array<String>}
 */
function getChatFilter(guild) {
    return guilds[guild.id].chatFilter
}

exports.getChatFilter = getChatFilter

/**
 * 
 * @param {Guild} guild 
 * @param {Array<String>} array 
 */
function updateChatFilter(guild, array) {
    guilds[guild.id].chatFilter = array
}

exports.updateChatFilter = updateChatFilter

function getTimestamp() {
    const date = new Date()
    let hours = date.getHours().toString()
    let minutes = date.getMinutes().toString()
    let seconds = date.getSeconds().toString()
    
    if (hours.length == 1) {
        hours = "0" + hours
    } 
    
    if (minutes.length == 1) {
        minutes = "0" + minutes
    } 
    
    if (seconds.length == 1) {
        seconds = "0" + seconds
    }
    
    const timestamp = hours + ":" + minutes + ":" + seconds

    return timestamp
}