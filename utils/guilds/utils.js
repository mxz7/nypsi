const { Guild, Client } = require("discord.js")
const fs = require("fs")
const { CustomEmbed } = require("../classes/EmbedBuilders")
const { GuildStorage, Countdown } = require("../classes/GuildStorage")
const { info, types, error } = require("../logger")
const { daysUntilChristmas, MStoTime, daysUntil } = require("../utils")
let guilds = JSON.parse(fs.readFileSync("./utils/guilds/data.json"))

let timer = 0
let timerCheck = true
setInterval(() => {
    const guilds1 = JSON.parse(fs.readFileSync("./utils/guilds/data.json"))

    if (JSON.stringify(guilds) != JSON.stringify(guilds1)) {
        fs.writeFile("./utils/guilds/data.json", JSON.stringify(guilds), (err) => {
            if (err) {
                return console.log(err)
            }
            info("guilds saved", types.DATA)
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 10 && !timerCheck) {
        guilds = JSON.parse(fs.readFileSync("./utils/guilds/data.json"))
        info("guild data refreshed", types.DATA)
        timerCheck = true
        timer = 0
    }
}, 120000)

setInterval(async () => {
    const { snipe, eSnipe, mentions } = require("../../nypsi")

    const now = new Date().getTime()

    let snipeCount,
        eSnipeCount,
        mentionsCount = 0

    await snipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            snipe.delete(msg.channel.id)
            snipeCount++
        }
    })

    if (snipeCount > 0) {
        info("deleted " + snipeCount.toLocaleString() + " sniped messages", types.AUTOMATION)
    }

    await eSnipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            eSnipe.delete(msg.channel.id)
            eSnipeCount++
        }
    })

    if (eSnipeCount > 0) {
        info("deleted " + eSnipeCount.toLocaleString() + " edit sniped messages", types.AUTOMATION)
    }

    await mentions.forEach(async (guildData, key) => {
        await guildData.forEach((userData, key) => {
            for (let i of userData) {
                const diff = now - i.date

                if (diff >= 86400000) {
                    userData.splice(userData.indexOf(i), 1)
                    mentionsCount++
                }
            }

            if (userData.length == 0) {
                guildData.delete(key)
            }
        })
        if (guildData.size == 0) {
            mentions.delete(key)
        }
    })

    if (mentionsCount > 0) {
        info("deleted " + mentionsCount.toLocaleString() + " mentions", types.AUTOMATION)
    }
}, 3600000)

setInterval(async () => {
    const { checkGuild } = require("../../nypsi")

    for (let guild in guilds) {
        const exists = await checkGuild(guild)

        if (!exists) {
            delete guilds[guild]

            info(`deleted guild '${guild}' from guilds data`, types.GUILD)
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
        info(
            "members peak updated for '" +
                guild.name +
                "' " +
                currentMembersPeak.toLocaleString() +
                " -> " +
                guild.memberCount.toLocaleString(),
            types.AUTOMATION
        )
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
    const members = guild.members.cache.filter((member) => !member.user.bot)

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
        channel: "none",
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

    if (guilds[guild.id].counter.filterBots && guild.memberCount >= 2500) {
        guilds[guild.id].counter.filterBots = false
        memberCount = guild.memberCount
    } else if (guilds[guild.id].counter.filterBots) {
        let members

        if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
            members = guild.members.cache
        } else {
            members = await guild.members.fetch().catch(() => {})
            addCooldown(guild, 3600)
        }

        if (members.size == guild.memberCount) {
            members = members.filter((m) => !m.user.bot)

            memberCount = members.size
        } else {
            memberCount = guild.memberCount
        }
    } else {
        memberCount = guild.memberCount
    }

    if (!memberCount) memberCount = guild.memberCount

    const channel = guild.channels.cache.find((c) => c.id == guilds[guild.id].counter.channel)

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

        await channel
            .edit({ name: format })
            .then(() => {
                info(
                    "counter updated for '" + guild.name + "' ~ '" + old + "' -> '" + format + "'",
                    types.AUTOMATION
                )
            })
            .catch(() => {
                error("error updating counter in " + guild.name)
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
        error("couldn't fetch prefix for server " + guild.id)
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
        channel: "none",
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
    const channel = guild.channels.cache.find((c) => c.id == guilds[guild.id].xmas.channel)

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

    await channel
        .send(
            new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")
        )
        .then(() => {
            info(`sent christmas countdown in ${guild.name} ~ ${format}`, types.AUTOMATION)
        })
        .catch(() => {
            error(`error sending christmas countdown in ${guild.name}`)
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

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getDisabledCommands(guild) {
    return guilds[guild.id].disabledCommands
}

exports.getDisabledCommands = getDisabledCommands

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} array
 */
function updateDisabledCommands(guild, array) {
    guilds[guild.id].disabledCommands = array
}

exports.updateDisabledCommands = updateDisabledCommands

/**
 *
 * @param {Guild} guild
 * @returns {{}}
 */
function getCountdowns(guild) {
    if (!guilds[guild.id].countdowns) {
        guilds[guild.id].countdowns = {}
    }

    return guilds[guild.id].countdowns
}

exports.getCountdowns = getCountdowns

/**
 *
 * @param {Guild} guild
 * @param {Date} date
 * @param {String} format
 * @param {String} finalFormat
 * @param {String} channel
 */
function addCountdown(guild, date, format, finalFormat, channel) {
    if (!guilds[guild.id].countdowns) {
        guilds[guild.id].countdowns = {}
    }

    let id = 1

    while (Object.keys(guilds[guild.id].countdowns).indexOf(id.toString()) != -1) {
        id++
    }

    guilds[guild.id].countdowns[id] = new Countdown(date, format, finalFormat, channel, id)
}

exports.addCountdown = addCountdown

/**
 *
 * @param {Guild} guild
 * @param {String} id
 */
function deleteCountdown(guild, id) {
    let guildID

    if (!guild.id) {
        guildID = guild
    } else {
        guildID = guild.id
    }

    delete guilds[guild.id].countdowns[id]
}

exports.deleteCountdown = deleteCountdown

/**
 *
 * @param {Client} client
 */
function runCountdowns(client) {
    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000)

    const runCountdowns = async () => {
        for (let guild in guilds) {
            const guildID = guild
            guild = guilds[guild]

            if (!guild.countdowns) continue
            if (Object.keys(guild.countdowns).length == 0) continue

            for (let countdown in guild.countdowns) {
                countdown = guild.countdowns[countdown]

                let days = daysUntil(new Date(countdown.date))

                let message

                if (days == 0) {
                    message = countdown.finalFormat
                } else {
                    message = countdown.format.split("%days%").join((days + 1).toLocaleString())
                }

                const embed = new CustomEmbed()

                embed.setDescription(message)
                embed.setColor("#37393f")

                const guildToSend = await client.guilds.fetch(guildID)

                if (!guildToSend) return

                const channel = guildToSend.channels.cache.find((ch) => ch.id == countdown.channel)

                await channel
                    .send(embed)
                    .then(() => {
                        info(
                            `sent custom countdown (${countdown.id}) in ${guildToSend.name} (${guildID})`, types.AUTOMATION
                        )
                    })
                    .catch(() => {
                        error(
                            `error sending custom countdown (${countdown.id}) ${guildToSend.name} (${guildID})`
                        )
                    })

                if (days == 0) {
                    deleteCountdown(guildID, countdown.id)
                }
            }
        }
    }

    setTimeout(async () => {
        setInterval(() => {
            runCountdowns()
        }, 86400000)
        runCountdowns()
    }, needed - now)

    info(`custom countdowns will run in ${MStoTime(needed - now)}`, types.AUTOMATION)
}

exports.runCountdowns = runCountdowns
