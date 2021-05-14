const { Guild, Client } = require("discord.js")
const fs = require("fs")
const { CustomEmbed } = require("../classes/EmbedBuilders")
const { GuildStorage, Countdown } = require("../classes/GuildStorage")
const { getDatabase, toArray, toStorage } = require("../database/database")
const { info, types, error } = require("../logger")
const { daysUntilChristmas, MStoTime, daysUntil } = require("../utils")
let guilds = JSON.parse(fs.readFileSync("./utils/guilds/data.json"))
info(`${Array.from(Object.keys(guilds)).length.toLocaleString()} guilds loaded`, types.DATA)
const db = getDatabase()

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
}, 120000 + Math.floor(Math.random() * 60) * 1000)

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
const prefixCache = new Map()

/**
 *
 * @param {Guild} guild run check for guild
 */
function runCheck(guild) {
    if (!hasGuild(guild)) createGuild(guild)

    const currentMembersPeak = db.prepare("SELECT peak FROM guilds WHERE id = ?").get(guild.id)

    if (guild.memberCount > currentMembersPeak) {
        db.prepare("UPDATE guilds SET peak = ? WHERE id = ?").run(currentMembersPeak, guild.id)
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
    const query = db.prepare("SELECT id FROM guilds WHERE id = ?").get(guild.id)

    if (query) {
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
    const query = db.prepare("SELECT peak FROM guilds WHERE id = ?").get(guild.id)

    return query.peak
}

exports.getPeaks = getPeaks

/**
 *
 * @param {Guild} guild create guild profile
 */
function createGuild(guild) {
    db.prepare("INSERT INTO guilds (id) VALUES (?)").run(guild.id)
    db.prepare("INSERT INTO guilds_counters (guild_id) VALUES (?)").run(guild.id)
    db.prepare("INSERT INTO guilds_christmas (guild_id) VALUES (?)").run(guild.id)
}

exports.createGuild = createGuild

/**
 * @param {Guild} guild get snipe filter
 * @returns {Array<String>}
 */
function getSnipeFilter(guild) {
    const query = db.prepare("SELECT snipe_filter FROM guilds WHERE id = ?").get(guild.id)

    const filter = toArray(query.snipe_filter)

    return filter
}

exports.getSnipeFilter = getSnipeFilter

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} array
 */
function updateFilter(guild, array) {
    const filter = toStorage(array)

    db.prepare("UPDATE guilds SET snipe_filter = ? WHERE id = ?").run(filter, guild.id)
}

exports.updateFilter = updateFilter

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
function hasStatsEnabled(guild) {
    const query = db.prepare("SELECT enabled FROM guilds_counters WHERE guild_id = ?").get(guild.id)

    if (query.enabled === 1) {
        return true
    } else {
        return false
    }
}

exports.hasStatsEnabled = hasStatsEnabled

/**
 * @returns {JSON}
 * @param {Guild} guild
 */
function getStatsProfile(guild) {
    const query = db.prepare("SELECT * FROM guilds_counters WHERE guild_id = ?").get(guild.id)

    return query
}

exports.getStatsProfile = getStatsProfile

/**
 *
 * @param {Guild} guild
 * @param {JSON} profile
 */
function setStatsProfile(guild, profile) {
    db.prepare("UPDATE guilds_counters SET enabled = ?, format = ?, filter_bots = ?, channel = ? WHERE guild_id = ?").run(profile.enabled ? 1 : 0, profile.format, profile.filter_bots, profile.channel, guild.id)
}

exports.setStatsProfile = setStatsProfile

/**
 *
 * @param {Guild} guild
 */
async function checkStats(guild) {
    let memberCount

    const profile = db.prepare("SELECT * FROM guilds_counters WHERE guild_id = ?").get(guild.id)

    if (profile.filter_bots && guild.memberCount >= 500) {
        profile.filter_bots = 0
        setStatsProfile(guild, profile)
        memberCount = guild.memberCount
    } else if (profile.filter_bots) {
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

    const channel = guild.channels.cache.find((c) => c.id == profile.channel)

    if (!channel) {
        profile.enabled = false
        profile.channel = "none"
        setStatsProfile(guild, profile)
        return
    }

    let format = profile.format
    format = format.split("%count%").join(memberCount.toLocaleString())
    format = format.split("%peak%").join(getPeaks(guild).toLocaleString())

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
                profile.enabled = false
                profile.channel = "none"
                setStatsProfile(guild, profile)
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
        if (prefixCache.has(guild.id)) {
            return prefixCache.get(guild.id)
        }

        const query = db.prepare("SELECT prefix FROM guilds WHERE id = ?").get(guild.id)

        prefixCache.set(guild.id, query.prefix)

        setTimeout(() => {
            if (!prefixCache.has(guild.id)) return
            prefixCache.delete(guild.id)
        }, 3600000)

        return query.prefix
    } catch (e) {
        if (!hasGuild(guild)) createGuild(guild)
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
    db.prepare("UPDATE guilds SET prefix = ? WHERE id = ?").run(prefix, guild.id)

    if (prefixCache.has(guild.id)) prefixCache.delete(guild.id)
}

exports.setPrefix = setPrefix

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
function hasChristmasCountdown(guild) {
    const query = db.prepare("SELECT guild_id FROM guilds_christmas WHERE guild_id = ?").get(guild.id)

    if (query) {
        return true
    } else {
        return false
    }
}

exports.hasChristmasCountdown = hasChristmasCountdown

function createNewChristmasCountdown(guild) {
    db.prepare("INSERT INTO guilds_christmas (guild_id) VALUES (?)").run(guild.id)
}

exports.createNewChristmasCountdown = createNewChristmasCountdown

/**
 * @returns {JSON}
 * @param {Guild} guild
 */
function getChristmasCountdown(guild) {
    const query = db.prepare("SELECT * FROM guilds_christmas WHERE guild_id = ?").get(guild.id)

    return query
}

exports.getChristmasCountdown = getChristmasCountdown

/**
 *
 * @param {Guild} guild
 * @param {JSON} xmas
 */
function setChristmasCountdown(guild, xmas) {
    db.prepare("UPDATE guilds_christmas SET enabled = ?, format = ?, channel = ? WHERE guild_id = ?").run(xmas.enabled, xmas.format, xmas.channel, guild.id)
}

exports.setChristmasCountdown = setChristmasCountdown

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
function hasChristmasCountdownEnabled(guild) {
    const query = db.prepare("SELECT enabled FROM guilds_christmas WHERE guild_id = ?").get(guild.id)

    if (query.enabled) {
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
    const profile = db.prepare("SELECT * FROM guilds_christmas WHERE guild_id = ?").get(guild.id)

    const channel = guild.channels.cache.find((c) => c.id == profile.channel)

    if (!channel) {
        profile.enabled = false
        profile.channel = "none"
        setChristmasCountdown(guild, profile)
        return
    }

    let format = profile.format

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
            profile.enabled = false
            profile.channel = "none"
            setChristmasCountdown(guild, profile)
            return
        })
}

exports.checkChristmasCountdown = checkChristmasCountdown

/**
 * @param {Guild} guild get chat filter
 * @returns {Array<String>}
 */
function getChatFilter(guild) {
    const query = db.prepare("SELECT chat_filter FROM guilds WHERE id = ?").get(guild.id)

    const filter = toArray(query.chat_filter)

    return filter
}

exports.getChatFilter = getChatFilter

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} array
 */
function updateChatFilter(guild, array) {
    const filter = toStorage(array)

    db.prepare("UPDATE guilds SET chat_filter = ? WHERE id = ?").run(filter, guild.id)
}

exports.updateChatFilter = updateChatFilter

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getDisabledCommands(guild) {
    const query = db.prepare("SELECT disabled_commands FROM guilds WHERE id = ?").get(guild.id)

    const disabled = toArray(query.disabled_commands)

    return disabled
}

exports.getDisabledCommands = getDisabledCommands

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} array
 */
function updateDisabledCommands(guild, array) {
    const disabled = toStorage(array)

    db.prepare("UPDATE guilds SET disabled_commands = ? WHERE id = ?").run(disabled, guild.id)
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

    delete guilds[guildID].countdowns[id]
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

                let days = daysUntil(new Date(countdown.date)) + 1

                let message

                if (days == 0) {
                    message = countdown.finalFormat
                } else {
                    message = countdown.format.split("%days%").join(days.toLocaleString())
                }

                const embed = new CustomEmbed()

                embed.setDescription(message)
                embed.setColor("#111111")

                const guildToSend = await client.guilds.fetch(guildID)

                if (!guildToSend) return

                const channel = guildToSend.channels.cache.find((ch) => ch.id == countdown.channel)

                await channel
                    .send(embed)
                    .then(() => {
                        info(
                            `sent custom countdown (${countdown.id}) in ${guildToSend.name} (${guildID})`,
                            types.AUTOMATION
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
