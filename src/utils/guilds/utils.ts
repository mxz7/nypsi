import { BaseGuildTextChannel, Client, Collection, Guild, GuildMember } from "discord.js"
import { getDatabase, toArray, toStorage } from "../database/database"
import { logger } from "../logger"
import { CustomEmbed } from "../models/EmbedBuilders"
import { ChristmasProfile, Countdown, CounterProfile } from "../models/GuildStorage"
import { daysUntil, daysUntilChristmas, MStoTime } from "../utils"

declare function require(name: string)

const db = getDatabase()

setInterval(async () => {
    const { snipe, eSnipe } = require("../../nypsi")

    const now = new Date().getTime()

    let snipeCount = 0
    let eSnipeCount = 0

    await snipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            snipe.delete(msg.channel.id)
            snipeCount++
        }
    })

    if (snipeCount > 0) {
        logger.log({
            level: "auto",
            message: "deleted " + snipeCount.toLocaleString() + " sniped messages",
        })
    }

    await eSnipe.forEach((msg) => {
        const diff = now - msg.createdTimestamp

        if (diff >= 43200000) {
            eSnipe.delete(msg.channel.id)
            eSnipeCount++
        }
    })

    if (eSnipeCount > 0) {
        logger.log({
            level: "auto",
            message: "deleted " + eSnipeCount.toLocaleString() + " edit sniped messages",
        })
    }
}, 3600000)

setInterval(async () => {
    const { checkGuild } = require("../../nypsi")

    const query = db.prepare("SELECT id FROM guilds").all()

    for (const guild of query) {
        const exists = await checkGuild(guild.id)

        if (!exists) {
            db.prepare("DELETE FROM guilds_counters WHERE guild_id = ?").run(guild.id)
            db.prepare("DELETE FROM guilds_christmas WHERE guild_id = ?").run(guild.id)
            db.prepare("DELETE FROM guilds WHERE id = ?").run(guild.id)

            if (existsCooldown.has(guild)) existsCooldown.delete(guild)

            logger.log({
                level: "guild",
                message: `deleted guild '${guild.id}' from guild data`,
            })
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
export function runCheck(guild: Guild) {
    if (!hasGuild(guild)) createGuild(guild)

    const query = db.prepare("SELECT peak FROM guilds WHERE id = ?").get(guild.id)

    if (!query) {
        db.prepare("DELETE FROM guilds_counters WHERE guild_id = ?").run(guild.id)
        db.prepare("DELETE FROM guilds_christmas WHERE guild_id = ?").run(guild.id)
        db.prepare("DELETE FROM guilds WHERE id = ?").run(guild.id)

        if (existsCooldown.has(guild)) existsCooldown.delete(guild)

        logger.log({
            level: "guild",
            message: `deleted guild '${guild.id}' from guild data`,
        })
        return
    }

    const currentMembersPeak = query.peak

    if (guild.memberCount > currentMembersPeak) {
        db.prepare("UPDATE guilds SET peak = ? WHERE id = ?").run(guild.memberCount, guild.id)
        logger.log({
            level: "auto",
            message:
                "members peak updated for '" +
                guild.name +
                "' " +
                currentMembersPeak.toLocaleString() +
                " -> " +
                guild.memberCount.toLocaleString(),
        })
    }
}

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
export function hasGuild(guild: Guild): boolean {
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

/**
 * @returns {JSON}
 * @param {Guild} guild
 */
export function getPeaks(guild: Guild): number {
    const query = db.prepare("SELECT peak FROM guilds WHERE id = ?").get(guild.id)

    return query.peak
}

/**
 *
 * @param {Guild} guild create guild profile
 */
export function createGuild(guild: Guild) {
    db.prepare("INSERT INTO guilds (id) VALUES (?)").run(guild.id)
    db.prepare("INSERT INTO guilds_counters (guild_id) VALUES (?)").run(guild.id)
    db.prepare("INSERT INTO guilds_christmas (guild_id) VALUES (?)").run(guild.id)

    existsCooldown.add(guild)

    setTimeout(() => {
        if (!existsCooldown.has(guild.id)) return
        existsCooldown.delete(guild.id)
    }, 43200000)
}

/**
 * @param {Guild} guild get snipe filter
 * @returns {Array<String>}
 */
export function getSnipeFilter(guild: Guild): Array<string> {
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

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} array
 */
export function updateFilter(guild: Guild, array: Array<string>) {
    const filter = toStorage(array)

    db.prepare("UPDATE guilds SET snipe_filter = ? WHERE id = ?").run(filter, guild.id)
    if (snipeFilterCache.has(guild.id)) snipeFilterCache.delete(guild.id)
}

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
export function hasStatsEnabled(guild: Guild): boolean {
    const query = db.prepare("SELECT enabled FROM guilds_counters WHERE guild_id = ?").get(guild.id)

    if (query.enabled === 1) {
        return true
    } else {
        return false
    }
}

/**
 * @returns {JSON}
 * @param {Guild} guild
 */
export function getStatsProfile(guild: Guild): CounterProfile {
    const query = db.prepare("SELECT * FROM guilds_counters WHERE guild_id = ?").get(guild.id)

    return query
}

/**
 *
 * @param {Guild} guild
 * @param {JSON} profile
 */
export function setStatsProfile(guild: Guild, profile: CounterProfile) {
    db.prepare("UPDATE guilds_counters SET enabled = ?, format = ?, filter_bots = ?, channel = ? WHERE guild_id = ?").run(
        profile.enabled ? 1 : 0,
        profile.format,
        profile.filter_bots,
        profile.channel,
        guild.id
    )
}

export function checkStats() {
    setInterval(async () => {
        const query = db.prepare("SELECT * from guilds_counters WHERE enabled = 1").all()

        for (const profile of query) {
            const { getGuild } = require("../../nypsi")
            const guild = await getGuild(profile.guild_id)

            if (!guild) continue

            let memberCount: number

            if (profile.filter_bots && guild.memberCount >= 500) {
                profile.filter_bots = 0
                setStatsProfile(guild, profile)
                memberCount = guild.memberCount
            } else if (profile.filter_bots) {
                let members: Collection<string, GuildMember>

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
                        logger.log({
                            level: "auto",
                            message: "counter updated for '" + guild.name + "' ~ '" + old + "' -> '" + format + "'",
                        })
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

/**
 *
 * @param {Guild} guild
 * @param {Number} seconds
 */
export function addCooldown(guild: Guild, seconds: number) {
    fetchCooldown.add(guild.id)

    setTimeout(() => {
        fetchCooldown.delete(guild.id)
    }, seconds * 1000)
}

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
export function inCooldown(guild: Guild): boolean {
    if (fetchCooldown.has(guild.id)) {
        return true
    } else {
        return false
    }
}

/**
 * @returns {String}
 * @param {Guild} guild
 */
export function getPrefix(guild: Guild): string {
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

/**
 *
 * @param {Guild} guild
 * @param {String} prefix
 */
export function setPrefix(guild: Guild, prefix: string) {
    db.prepare("UPDATE guilds SET prefix = ? WHERE id = ?").run(prefix, guild.id)

    if (prefixCache.has(guild.id)) prefixCache.delete(guild.id)
}

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
export function hasChristmasCountdown(guild: Guild): boolean {
    const query = db.prepare("SELECT guild_id FROM guilds_christmas WHERE guild_id = ?").get(guild.id)

    if (query) {
        return true
    } else {
        return false
    }
}

export function createNewChristmasCountdown(guild: Guild) {
    db.prepare("INSERT INTO guilds_christmas (guild_id) VALUES (?)").run(guild.id)
}

/**
 * @returns {JSON}
 * @param {Guild} guild
 */
export function getChristmasCountdown(guild: Guild): ChristmasProfile {
    const query = db.prepare("SELECT * FROM guilds_christmas WHERE guild_id = ?").get(guild.id)

    return query
}

/**
 *
 * @param {Guild} guild
 * @param {JSON} xmas
 */
export function setChristmasCountdown(guild: Guild, xmas: ChristmasProfile) {
    db.prepare("UPDATE guilds_christmas SET enabled = ?, format = ?, channel = ? WHERE guild_id = ?").run(
        xmas.enabled ? 1 : 0,
        xmas.format,
        xmas.channel,
        guild.id
    )
}

/**
 * @returns {Boolean}
 * @param {Guild} guild
 */
export function hasChristmasCountdownEnabled(guild: Guild): boolean {
    const query = db.prepare("SELECT enabled FROM guilds_christmas WHERE guild_id = ?").get(guild.id)

    if (query.enabled) {
        return true
    } else {
        return false
    }
}

/**
 *
 * @param {Guild} guild
 */
export async function checkChristmasCountdown(guild: Guild) {
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

    if (channel.type != "GUILD_TEXT") return

    return await channel
        .send({
            embeds: [new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")],
        })
        .then(() => {
            logger.log({
                level: "auto",
                message: `sent christmas countdown in ${guild.name} ~ ${format}`,
            })
        })
        .catch(() => {
            logger.error(`error sending christmas countdown in ${guild.name}`)
            profile.enabled = false
            profile.channel = "none"
            setChristmasCountdown(guild, profile)
            return
        })
}

/**
 * @param {Guild} guild get chat filter
 * @returns {Array<String>}
 */
export function getChatFilter(guild: Guild): Array<string> {
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

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} array
 */
export function updateChatFilter(guild: Guild, array: Array<string>) {
    const filter = toStorage(array)

    db.prepare("UPDATE guilds SET chat_filter = ? WHERE id = ?").run(filter, guild.id)

    if (chatFilterCache.has(guild.id)) chatFilterCache.delete(guild.id)
}

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
export function getDisabledCommands(guild: Guild): Array<string> {
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

/**
 *
 * @param {Guild} guild
 * @param {Array<String>} array
 */
export function updateDisabledCommands(guild: Guild, array: Array<string>) {
    const disabled = toStorage(array)

    db.prepare("UPDATE guilds SET disabled_commands = ? WHERE id = ?").run(disabled, guild.id)
    if (disableCache.has(guild.id)) disableCache.delete(guild.id)
}

/**
 *
 * @param {Guild} guild
 * @returns {{}}
 */
export function getCountdowns(guild: Guild | string): { [key: number]: Countdown } {
    let guildID

    if (guild instanceof Guild) {
        guildID = guild.id
    } else {
        guildID = guild
    }

    const query = db.prepare("SELECT countdowns FROM guilds WHERE id = ?").get(guildID)

    const countdowns = JSON.parse(query.countdowns)

    return countdowns
}

/**
 *
 * @param {Guild} guild
 * @param {Date} date
 * @param {String} format
 * @param {String} finalFormat
 * @param {String} channel
 */
export function addCountdown(guild: Guild, date: Date | number, format: string, finalFormat: string, channel: string) {
    const countdowns = getCountdowns(guild)

    let id = 1

    while (Object.keys(countdowns).indexOf(id.toString()) != -1) {
        id++
    }

    if (date instanceof Date) {
        date = date.getTime()
    }

    const c: Countdown = {
        date: date,
        format: format,
        finalFormat: finalFormat,
        channel: channel,
        id: id,
    }

    countdowns[id] = c

    db.prepare("UPDATE guilds SET countdowns = ? WHERE id = ?").run(JSON.stringify(countdowns), guild.id)
}

/**
 *
 * @param {Guild} guild
 * @param {String} id
 */
export function deleteCountdown(guild: Guild | string, id: string | number) {
    let guildID: string

    if (guild instanceof Guild) {
        guildID = guild.id
    } else {
        guildID = guild
    }

    const countdowns = getCountdowns(guildID)

    delete countdowns[id]

    db.prepare("UPDATE guilds SET countdowns = ? WHERE id = ?").run(JSON.stringify(countdowns), guildID)
}

/**
 *
 * @param {Client} client
 */
export function runCountdowns(client: Client) {
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

            for (const countdown of Array.from(Object.keys(countdowns))) {
                const c: Countdown = countdowns[countdown]

                const days = daysUntil(new Date(c.date)) + 1

                let message

                if (days == 0) {
                    message = c.finalFormat
                } else {
                    message = c.format.split("%days%").join(days.toLocaleString())
                }

                const embed = new CustomEmbed()

                embed.setDescription(message)
                embed.setColor("#111111")

                const guildToSend = await client.guilds.fetch(guildID).catch(() => {})

                if (!guildToSend) continue

                const channel = guildToSend.channels.cache.find((ch) => ch.id == c.channel)

                if (!channel) continue

                if (!(channel instanceof BaseGuildTextChannel)) continue

                await channel
                    .send({ embeds: [embed] })
                    .then(() => {
                        logger.log({
                            level: "auto",
                            message: `sent custom countdown (${c.id}) in ${guildToSend.name} (${guildID})`,
                        })
                    })
                    .catch(() => {
                        logger.error(`error sending custom countdown (${c.id}) ${guildToSend.name} (${guildID})`)
                    })

                if (days <= 0) {
                    deleteCountdown(guildID, c.id)
                }
            }
        }
    }

    setTimeout(async () => {
        setInterval(() => {
            runCountdowns()
        }, 86400000)
        runCountdowns()
    }, needed.getTime() - now.getTime())

    logger.log({
        level: "auto",
        message: `custom countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    })
}

/**
 *
 * @param {Client} client
 */
export function runChristmas(client: Client) {
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

            if (!(channel instanceof BaseGuildTextChannel)) continue

            await channel
                .send({
                    embeds: [new CustomEmbed().setDescription(format).setColor("#ff0000").setTitle(":santa_tone1:")],
                })
                .then(() => {
                    logger.log({
                        level: "auto",
                        message: `sent christmas countdown in ${guild.name} ~ ${format}`,
                    })
                })
                .catch(() => {
                    logger.error(`error sending christmas countdown in ${guild.name}`)
                    profile.enabled = false
                    profile.channel = "none"
                    setChristmasCountdown(guild, profile)
                })
        }
    }

    setTimeout(async () => {
        setInterval(() => {
            runChristmasThing()
        }, 86400000)
        runChristmasThing()
    }, needed.getTime() - now.getTime())

    logger.log({
        level: "auto",
        message: `christmas countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    })
}
