const { Guild, Client } = require("discord.js")
const { CustomEmbed } = require("../classes/EmbedBuilders")
const { Countdown } = require("../classes/GuildStorage")
const { getDatabase, toArray, toStorage } = require("../database/database")
const { logger } = require("../logger")
const { daysUntilChristmas, MStoTime, daysUntil } = require("../utils")
const db = getDatabase()

setInterval(async () => {
    const { snipe, eSnipe } = require("../../nypsi")

    const now = new Date().getTime()

    let snipeCount,
        eSnipeCount = 0

    await snipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            snipe.delete(msg.channel.id)
            snipeCount++
        }
    })

    if (snipeCount > 0) {
        logger.auto("deleted " + snipeCount.toLocaleString() + " sniped messages")
    }

    await eSnipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            eSnipe.delete(msg.channel.id)
            eSnipeCount++
        }
    })

    if (eSnipeCount > 0) {
        logger.auto("deleted " + eSnipeCount.toLocaleString() + " edit sniped messages")
    }
}, 3600000)

setInterval(async () => {
    const { checkGuild } = require("../../nypsi")

    const query = db.prepare("SELECT id FROM guilds").all()

    for (let guild of query) {
        const exists = await checkGuild(guild.id)

        if (!exists) {
            db.prepare("DELETE FROM guilds_counters WHERE guild_id = ?").run(guild.id)
            db.prepare("DELETE FROM guilds_christmas WHERE guild_id = ?").run(guild.id)
            db.prepare("DELETE FROM guilds WHERE id = ?").run(guild.id)

            if (existsCooldown.has(guild)) existsCooldown.delete(guild)

            logger.guild(`deleted guild '${guild.id}' from guild data`)
        }
    }
}, 24 * 60 * 60 * 1000)

const fetchCooldown = new Set()
const prefixCache = new Map()
const existsCooldown = new Set()
const disableCache = new Map()
const chatFilterCache = new Map()
const snipeFilterCache = new Map()

/**
 *
 * @param {Guild} guild run check for guild
 */
function runCheck(guild) {
    if (!hasGuild(guild)) createGuild(guild)

    const query = db.prepare("SELECT peak FROM guilds WHERE id = ?").get(guild.id)

    if (!query) {
        db.prepare("DELETE FROM guilds_counters WHERE guild_id = ?").run(guild.id)
        db.prepare("DELETE FROM guilds_christmas WHERE guild_id = ?").run(guild.id)
        db.prepare("DELETE FROM guilds WHERE id = ?").run(guild.id)

        if (existsCooldown.has(guild)) existsCooldown.delete(guild)

        logger.guild(`deleted guild '${guild.id}' from guild data`)
        return
    }

    const currentMembersPeak = query.peak

    if (guild.memberCount > currentMembersPeak) {
        db.prepare("UPDATE guilds SET peak = ? WHERE id = ?").run(guild.memberCount, guild.id)
        logger.auto(
            "members peak updated for '" +
                guild.name +
                "' " +
                currentMembersPeak.toLocaleString() +
                " -> " +
                guild.memberCount.toLocaleString()
        )
    }
}

exports.runCheck = runCheck

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
function hasGuild(guild) {
    if (existsCooldown.has(guild.id)) return true
    const query = db.prepare("SELECT id FROM guilds WHERE id = ?").get(guild.id)

    if (query) {
        existsCooldown.add(guild.id)

        setTimeout(() => {
            if (!existsCooldown.has(guild.id)) return
            existsCooldown.delete(guild.id)
        }, 43200000)
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

    existsCooldown.add(guild)

    setTimeout(() => {
        if (!existsCooldown.has(guild.id)) return
        existsCooldown.delete(guild.id)
    }, 43200000)
}

exports.createGuild = createGuild

/**
 * @param {Guild} guild get snipe filter
 * @returns {Array<String>}
 */
function getSnipeFilter(guild) {
    if (snipeFilterCache.has(guild.id)) {
        return snipeFilterCache.get(guild.id)
    }

    const query = db.prepare("SELECT snipe_filter FROM guilds WHERE id = ?").get(guild.id)

    const filter = toArray(query.snipe_filter)

    snipeFilterCache.set(guild.id, filter)

    setTimeout(() => {
        if (snipeFilterCache.has(guild.id)) snipeFilterCache.delete(guild.id)
    }, 43200000)

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
    if (snipeFilterCache.has(guild.id)) snipeFilterCache.delete(guild.id)
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
    db.prepare("UPDATE guilds_counters SET enabled = ?, format = ?, filter_bots = ?, channel = ? WHERE guild_id = ?").run(
        profile.enabled ? 1 : 0,
        profile.format,
        profile.filter_bots,
        profile.channel,
        guild.id
    )
}

exports.setStatsProfile = setStatsProfile

function checkStats() {
    setInterval(async () => {
        const query = db.prepare("SELECT * from guilds_counters WHERE enabled = 1").all()

        for (const profile of query) {
            const { getGuild } = require("../../nypsi")
            const guild = await getGuild(profile.guild_id)

            if (!guild) continue

            let memberCount

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

                if (!members) return

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
                continue
            }

            let format = profile.format
            format = format.split("%count%").join(memberCount.toLocaleString())
            format = format.split("%peak%").join(getPeaks(guild).toLocaleString())

            if (channel.name != format) {
                const old = channel.name

                await channel
                    .edit({ name: format })
                    .then(() => {
                        logger.auto("counter updated for '" + guild.name + "' ~ '" + old + "' -> '" + format + "'")
                    })
                    .catch(() => {
                        logger.warn("error updating counter in " + guild.name)
                        profile.enabled = false
                        profile.channel = "none"
                        setStatsProfile(guild, profile)
                    })
            }
        }
    }, 600000)
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
        logger.warn("couldn't fetch prefix for server " + guild.id)
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
    db.prepare("UPDATE guilds_christmas SET enabled = ?, format = ?, channel = ? WHERE guild_id = ?").run(
        xmas.enabled ? 1 : 0,
        xmas.format,
        xmas.channel,
        guild.id
    )
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

    return await channel
        .send({
            embeds: [new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")],
        })
        .then(() => {
            logger.auto(`sent christmas countdown in ${guild.name} ~ ${format}`)
        })
        .catch(() => {
            logger.error(`error sending christmas countdown in ${guild.name}`)
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
    if (chatFilterCache.has(guild.id)) {
        return chatFilterCache.get(guild.id)
    }

    const query = db.prepare("SELECT chat_filter FROM guilds WHERE id = ?").get(guild.id)

    const filter = toArray(query.chat_filter)

    chatFilterCache.set(guild.id, filter)

    setTimeout(() => {
        if (chatFilterCache.has(guild.id)) chatFilterCache.delete(guild.id)
    }, 43200000)

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

    if (chatFilterCache.has(guild.id)) chatFilterCache.delete(guild.id)
}

exports.updateChatFilter = updateChatFilter

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getDisabledCommands(guild) {
    if (disableCache.has(guild.id)) {
        return disableCache.get(guild.id)
    }

    const query = db.prepare("SELECT disabled_commands FROM guilds WHERE id = ?").get(guild.id)

    const disabled = toArray(query.disabled_commands)

    disableCache.set(guild.id, disabled)

    setTimeout(() => {
        if (disableCache.has(guild.id)) disableCache.delete(guild.id)
    }, 43200000)

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
    if (disableCache.has(guild.id)) disableCache.delete(guild.id)
}

exports.updateDisabledCommands = updateDisabledCommands

/**
 *
 * @param {Guild} guild
 * @returns {{}}
 */
function getCountdowns(guild) {
    let guildID

    if (!guild.id) {
        guildID = guild
    } else {
        guildID = guild.id
    }

    const query = db.prepare("SELECT countdowns FROM guilds WHERE id = ?").get(guildID)

    const countdowns = JSON.parse(query.countdowns)

    return countdowns
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
    const countdowns = getCountdowns(guild)

    let id = 1

    while (Object.keys(countdowns).indexOf(id.toString()) != -1) {
        id++
    }

    countdowns[id] = new Countdown(date, format, finalFormat, channel, id)

    db.prepare("UPDATE guilds SET countdowns = ? WHERE id = ?").run(JSON.stringify(countdowns), guild.id)
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

    const countdowns = getCountdowns(guildID)

    delete countdowns[id]

    db.prepare("UPDATE guilds SET countdowns = ? WHERE id = ?").run(JSON.stringify(countdowns), guildID)
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
        const query = db.prepare("SELECT id, countdowns FROM guilds").all()

        for (const guild of query) {
            const guildID = guild.id
            const countdowns = JSON.parse(guild.countdowns)

            if (!countdowns) continue
            if (Object.keys(countdowns).length == 0) continue

            for (let countdown in countdowns) {
                countdown = countdowns[countdown]

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

                const guildToSend = await client.guilds.fetch(guildID).catch(() => {})

                if (!guildToSend) continue

                const channel = guildToSend.channels.cache.find((ch) => ch.id == countdown.channel)

                if (!channel) continue

                await channel
                    .send({ embeds: [embed] })
                    .then(() => {
                        logger.auto(`sent custom countdown (${countdown.id}) in ${guildToSend.name} (${guildID})`)
                    })
                    .catch(() => {
                        logger.error(`error sending custom countdown (${countdown.id}) ${guildToSend.name} (${guildID})`)
                    })

                if (days <= 0) {
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

    logger.auto(`custom countdowns will run in ${MStoTime(needed - now)}`)
}

exports.runCountdowns = runCountdowns

/**
 *
 * @param {Client} client
 */
function runChristmas(client) {
    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000)

    const runChristmasThing = async () => {
        const query = db.prepare("SELECT * FROM guilds_christmas WHERE enabled = 1").all()

        for (const profile of query) {
            const guild = client.guilds.cache.find((g) => g.id == profile.guild_id)
            if (!guild) continue
            const channel = guild.channels.cache.find((c) => c.id == profile.channel)

            if (!channel) {
                profile.enabled = false
                profile.channel = "none"
                setChristmasCountdown(guild, profile)
                continue
            }

            let format = profile.format

            const days = daysUntilChristmas()

            format = format.split("%days%").join(daysUntilChristmas().toString())

            if (days == "ITS CHRISTMAS") {
                format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO"
            }

            await channel
                .send({
                    embeds: [new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")],
                })
                .then(() => {
                    logger.auto(`sent christmas countdown in ${guild.name} ~ ${format}`)
                })
                .catch(() => {
                    logger.error(`error sending christmas countdown in ${guild.name}`)
                    profile.enabled = false
                    profile.channel = "none"
                    setChristmasCountdown(guild, profile)
                    return
                })
        }
    }

    setTimeout(async () => {
        setInterval(() => {
            runChristmasThing()
        }, 86400000)
        runChristmasThing()
    }, needed - now)

    logger.auto(`christmas countdowns will run in ${MStoTime(needed - now)}`)
}

exports.runChristmas = runChristmas
