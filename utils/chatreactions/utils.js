const { Guild, TextChannel, GuildMember } = require("discord.js")
const fetch = require("node-fetch")
const { info, types, getTimestamp } = require("../logger")
const { getDatabase, toArray, toStorage } = require("../database/database")
const { inPlaceSort } = require("fast-sort")
const db = getDatabase()

const currentChannels = new Set()
const existsCache = new Set()
const enabledCache = new Map()
const lastGame = new Map()

setInterval(async () => {
    const { checkGuild, getGuild } = require("../../nypsi")

    const query = db.prepare("SELECT id FROM chat_reaction").all()

    for (let guild of query) {
        const exists = await checkGuild(guild.id)

        if (!exists) {
            db.prepare("DELETE FROM chat_reaction_stats WHERE guild_id = ?").run(guild.id)
            db.prepare("DELETE FROM chat_reaction WHERE id = ?").run(guild.id)

            info(`deleted guild '${guild.id}' from chat reaction data`, types.GUILD)
        }
    }
}, 24 * 60 * 60 * 1000)

setInterval(async () => {
    let count = 0

    const query = db
        .prepare("SELECT id, random_channels, between_events, random_modifier FROM chat_reaction WHERE random_start = 1")
        .all()

    for (const guildData of query) {
        const { getGuild } = require("../../nypsi")
        const guild = await getGuild(guildData.id)

        if (!guild) {
            continue
        }

        const channels = toArray(guildData.random_channels)

        if (channels.length == 0) continue

        const now = new Date().getTime()

        for (const ch of channels) {
            if (lastGame.has(ch)) {
                if (now >= lastGame.get(ch)) {
                    lastGame.delete(ch)
                } else {
                    continue
                }
            }

            const channel = await guild.channels.cache.find((cha) => cha.id == ch)

            if (!channel) {
                continue
            }

            const messages = await channel.messages.fetch({ limit: 15 })
            let stop = false

            await messages.forEach((m) => {
                if (m.author.id == guild.client.user.id) {
                    if (!m.embeds[0]) return
                    if (m.embeds[0].title == "chat reaction") {
                        stop = true
                        return
                    }
                }
            })

            if (stop) {
                continue
            }

            const a = await startReaction(guild, channel)

            if (a != "xoxo69") {
                count++
            } else {
                continue
            }

            const base = guildData.between_events
            let final

            if (guildData.random_modifier == 0) {
                final = base
            } else {
                const o = ["+", "-"]
                let operator = o[Math.floor(Math.random() * o.length)]

                if (base - guildData.random_modifier < 120) {
                    operator = "+"
                }

                const amount = Math.floor(Math.random() * guildData.random_modifier)

                if (operator == "+") {
                    final = base + amount
                } else {
                    final = base - amount
                }
            }

            const nextGame = new Date().getTime() + final * 1000

            lastGame.set(channel.id, nextGame)

            continue
        }
    }

    if (count > 0) {
        info(`${count} chat reactions automatically started`, types.AUTOMATION)
    }
}, 60000)

/**
 * @param {Guild} guild
 */
function createReactionProfile(guild) {
    db.prepare("INSERT INTO chat_reaction (id) VALUES (?)").run(guild.id)
}

exports.createReactionProfile = createReactionProfile

/**
 * @param {Guild} guild
 */
function hasReactionProfile(guild) {
    if (existsCache.has(guild.id)) {
        return true
    }

    const query = db.prepare("SELECT id FROM chat_reaction WHERE id = ?").get(guild.id)

    if (query) {
        existsCache.add(guild.id)
        return true
    } else {
        return false
    }
}

exports.hasReactionProfile = hasReactionProfile

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
async function getWords(guild) {
    const query = db.prepare("SELECT word_list FROM chat_reaction WHERE id = ?").get(guild.id)

    const wordList = toArray(query.word_list)

    if (wordList.length == 0) {
        const a = await getDefaultWords()

        return a
    } else {
        return wordList
    }
}

exports.getWords = getWords

/**
 * @param {Guild} guild
 * @param {Array<String>} newWordList
 */
async function updateWords(guild, newWordList) {
    const list = toStorage(newWordList)

    db.prepare("UPDATE chat_reaction SET word_list = ? WHERE id = ?").run(list, guild.id)
}

exports.updateWords = updateWords

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getWordList(guild) {
    const query = db.prepare("SELECT word_list FROM chat_reaction WHERE id = ?").get(guild.id)

    return toArray(query.word_list)
}

exports.getWordList = getWordList

/**
 * @param {Guild} guild
 * @returns {Boolean}
 */
async function isUsingDefaultWords(guild) {
    if (getWordList(guild.id).length == 0) {
        return true
    } else {
        return false
    }
}

exports.isUsingDefaultWords = isUsingDefaultWords

/**
 * @param {Guild} guild
 * @returns {{ randomStart: Boolean, randomChannels: Array<String>, timeBetweenEvents: Number, randomModifier: Number, timeout: Number}}
 */
function getReactionSettings(guild) {
    const query = db
        .prepare(
            "SELECT random_start, random_channels, between_events, random_modifier, timeout FROM chat_reaction WHERE id = ?"
        )
        .get(guild.id)

    return {
        randomStart: query.random_start == 1 ? true : false,
        randomChannels: toArray(query.random_channels),
        timeBetweenEvents: query.between_events,
        randomModifier: query.random_modifier,
        timeout: query.timeout,
    }
}

exports.getReactionSettings = getReactionSettings

/**
 * @param {Guild} guild
 * @param {{ randomStart: Boolean, randomChannels: Array<String>, timeBetweenEvents: Number, randomModifier: Number, timeout: Number}} settings
 */
function updateReactionSettings(guild, settings) {
    db.prepare(
        "UPDATE chat_reaction SET random_start = ?, random_channels = ?, between_events = ?, random_modifier = ?, timeout = ? WHERE id = ?"
    ).run(
        settings.randomStart ? 1 : 0,
        toStorage(settings.randomChannels),
        settings.timeBetweenEvents,
        settings.randomModifier,
        settings.timeout,
        guild.id
    )

    if (enabledCache.has(guild.id)) enabledCache.delete(guild.id)
}

exports.updateReactionSettings = updateReactionSettings

/**
 * @param {Guild} guild
 * @param {GuildMember} member
 * @returns {StatsProfile}
 */
function getReactionStats(guild, member) {
    const query = db
        .prepare("SELECT wins, second, third FROM chat_reaction_stats WHERE guild_id = ? AND user_id = ?")
        .get(guild.id, member.user.id)

    return {
        wins: query.wins,
        secondPlace: query.second,
        thirdPlace: query.third,
    }
}

exports.getReactionStats = getReactionStats

/**
 * @param {Guild} guild
 * @param {TextChannel} channel
 */
async function startReaction(guild, channel) {
    if (currentChannels.has(channel.id)) return "xoxo69"

    currentChannels.add(channel.id)

    const words = await getWords(guild)

    const chosenWord = words[Math.floor(Math.random() * words.length)]
    let displayWord = chosenWord

    const zeroWidthCount = chosenWord.length / 2

    const zeroWidthChar = getZeroWidth()

    for (let i = 0; i < zeroWidthCount; i++) {
        const pos = Math.floor(Math.random() * chosenWord.length + 1)

        displayWord = displayWord.substr(0, pos) + zeroWidthChar + displayWord.substr(pos)
    }

    const { CustomEmbed } = require("../classes/EmbedBuilders")

    const embed = new CustomEmbed().setColor("#5efb8f")

    embed.setTitle("chat reaction")
    embed.setDescription(`type: \`${displayWord}\``)

    const msg = await channel.send({ embeds: [embed] })

    const start = new Date().getTime()

    const winners = new Map()
    const winnersIDs = []

    let waiting = false

    const filter = (m) =>
        m.content.toLowerCase() == chosenWord.toLowerCase() &&
        winnersIDs.indexOf(m.author.id) == -1 &&
        !m.member.user.bot &&
        getBlacklisted(guild).indexOf(m.author.id) == -1

    const timeout = getReactionSettings(guild).timeout

    const collector = channel.createMessageCollector({
        filter,
        max: 3,
        time: timeout * 1000,
    })

    collector.on("collect", async (message) => {
        if (msg.deleted) {
            currentChannels.delete(channel.id)
            collector.stop()
            return
        }

        let time = new Date().getTime()

        time = ((time - start) / 1000).toFixed(2)

        if (!hasReactionStatsProfile(guild, message.member)) createReactionStatsProfile(guild, message.member)

        if (winners.size == 0) {
            embed.addField("winners", `🥇 ${message.author.toString()} in \`${time}s\``)

            addWin(guild, message.member)

            setTimeout(() => {
                if (winners.size != 3) {
                    return collector.stop()
                }
            }, 10000)
        } else {
            if (winners.size == 1) {
                waiting = true

                setTimeout(async () => {
                    waiting = false

                    if (winners.size == 1) {
                        return
                    } else {
                        const field = await embed.fields.find((f) => f.name == "winners")

                        field.value += `\n🥈 ${winners.get(2).mention} in \`${winners.get(2).time}s\``

                        add2ndPlace(guild, winners.get(2).member)

                        if (winners.get(3)) {
                            field.value += `\n🥉 ${winners.get(3).mention} in \`${winners.get(3).time}s\``
                            add3rdPlace(guild, winners.get(3).member)
                        }

                        return await msg.edit({ embeds: [embed] }).catch(() => {
                            collector.stop()
                        })
                    }
                }, 250)
            } else {
                if (!waiting) {
                    const field = await embed.fields.find((f) => f.name == "winners")

                    field.value += `\n🥉 ${message.author.toString()} in \`${time}s\``

                    add3rdPlace(guild, message.member)
                }
            }
        }

        winners.set(winners.size + 1, {
            mention: message.author.toString(),
            time: time,
            member: message.member,
        })
        winnersIDs.push(message.author.id)
        if (!waiting) {
            return await msg.edit({ embeds: [embed] }).catch(() => {
                collector.stop()
            })
        }
    })

    collector.on("end", () => {
        currentChannels.delete(channel.id)
        setTimeout(async () => {
            if (winners.size == 0) {
                embed.setDescription(embed.description + "\n\nnobody won ):")
            } else if (winners.size == 1) {
                embed.setFooter("ended with 1 winner")
            } else {
                embed.setFooter(`ended with ${winners.size} winners`)
            }
            await msg.edit({ embeds: [embed] }).catch(() => {})
        }, 500)
    })
}

exports.startReaction = startReaction

/**
 *
 * @param {Guild} guild
 * @param {GuildMember} member
 * @returns {Boolean}
 */
function hasReactionStatsProfile(guild, member) {
    const query = db
        .prepare("SELECT user_id FROM chat_reaction_stats WHERE guild_id = ? AND user_id = ?")
        .get(guild.id, member.user.id)

    if (query) {
        return true
    } else {
        return false
    }
}

exports.hasReactionStatsProfile = hasReactionStatsProfile

/**
 *
 * @param {Guild} guild
 * @param {guildMember} member
 */
function createReactionStatsProfile(guild, member) {
    db.prepare("INSERT INTO chat_reaction_stats (guild_id, user_id) VALUES (?, ?)").run(guild.id, member.user.id)
}

exports.createReactionStatsProfile = createReactionStatsProfile

/**
 * @param {Guild} guild
 * @param {GuildMember} member
 * @param {StatsProfile} newStats
 */
function updateStats(guild, member, newStats) {
    db.prepare("UPDATE chat_reaction_stats SET wins = ?, second = ?, third = ? WHERE guild_id = ? AND user_id = ?").run(
        newStats.wins,
        newStats.secondPlace,
        newStats.thirdPlace,
        guild.id,
        member.user.id
    )
}

exports.updateStats = updateStats

/**
 *
 * @param {Guild} guild
 * @param {GuildMember} member
 */
function addWin(guild, member) {
    db.prepare("UPDATE chat_reaction_stats SET wins = wins + 1 WHERE guild_id = ? AND user_id = ?").run(
        guild.id,
        member.user.id
    )
}

exports.addWin = addWin

/**
 *
 * @param {Guild} guild
 * @param {GuildMember} member
 */
function add2ndPlace(guild, member) {
    db.prepare("UPDATE chat_reaction_stats SET second = second + 1 WHERE guild_id = ? AND user_id = ?").run(
        guild.id,
        member.user.id
    )
}

exports.add2ndPlace = add2ndPlace

/**
 *
 * @param {Guild} guild
 * @param {GuildMember} member
 */
function add3rdPlace(guild, member) {
    db.prepare("UPDATE chat_reaction_stats SET third = third + 1 WHERE guild_id = ? AND user_id = ?").run(
        guild.id,
        member.user.id
    )
}

exports.add3rdPlace = add3rdPlace

/**
 * @param {Guild} guild
 * @param {Number} amount
 * @returns {Map}
 */
async function getServerLeaderboard(guild, amount) {
    const { inCooldown, addCooldown } = require("../guilds/utils")

    let members

    if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()

        addCooldown(guild, 3600)
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const usersWins = []
    const winsStats = new Map()
    const usersSecond = []
    const secondStats = new Map()
    const usersThird = []
    const thirdStats = new Map()
    const overallWins = []
    const overallStats = new Map()

    const query = db.prepare("SELECT user_id, wins, second, third FROM chat_reaction_stats WHERE guild_id = ?").all(guild.id)

    for (const user of query) {
        let overall = false

        if (members.find((member) => member.user.id == user.user_id) && user.wins != 0) {
            usersWins.push(user.user_id)
            winsStats.set(user.user_id, user.wins)
            overall = true
        }
        if (members.find((member) => member.user.id == user.user_id) && user.second != 0) {
            usersSecond.push(user.user_id)
            secondStats.set(user.user_id, user.second)
            overall = true
        }
        if (members.find((member) => member.user.id == user.user_id) && user.third != 0) {
            usersThird.push(user.user_id)
            thirdStats.set(user.user_id, user.third)
            overall = true
        }

        if (overall) {
            overallWins.push(user.user_id)
            overallStats.set(user.user_id, user.wins + user.second + user.third)
        }
    }

    const getMember = (id) => {
        const target = members.find((member) => member.user.id == id)

        return target
    }

    inPlaceSort(usersWins).desc((i) => winsStats.get(i))
    inPlaceSort(usersSecond).desc((i) => secondStats.get(i))
    inPlaceSort(usersThird).desc((i) => thirdStats.get(i))
    inPlaceSort(overallWins).desc((i) => overallStats.get(i))

    usersWins.splice(amount, usersWins.length - amount)
    usersSecond.splice(amount, usersSecond.length - amount)
    usersThird.splice(amount, usersThird.length - amount)
    overallWins.splice(amount, overallWins.length - amount)

    let winsMsg = ""
    let secondMsg = ""
    let thirdMsg = ""
    let overallMsg = ""

    let count = 1

    for (const user of usersWins) {
        let pos = count

        if (count == 1) {
            pos = "🥇"
        } else if (count == 2) {
            pos = "🥈"
        } else if (count == 3) {
            pos = "🥉"
        }

        winsMsg += `${pos} **${getMember(user).user.tag}** ${winsStats.get(user).toLocaleString()}\n`
        count++
    }

    count = 1

    for (const user of usersSecond) {
        let pos = count

        if (count == 1) {
            pos = "🥇"
        } else if (count == 2) {
            pos = "🥈"
        } else if (count == 3) {
            pos = "🥉"
        }

        secondMsg += `${pos} **${getMember(user).user.tag}** ${secondStats.get(user).toLocaleString()}\n`
        count++
    }

    count = 1

    for (const user of usersThird) {
        let pos = count

        if (count == 1) {
            pos = "🥇"
        } else if (count == 2) {
            pos = "🥈"
        } else if (count == 3) {
            pos = "🥉"
        }

        thirdMsg += `${pos} **${getMember(user).user.tag}** ${thirdStats.get(user).toLocaleString()}\n`
        count++
    }

    count = 1

    for (const user of overallWins) {
        let pos = count

        if (count == 1) {
            pos = "🥇"
        } else if (count == 2) {
            pos = "🥈"
        } else if (count == 3) {
            pos = "🥉"
        }

        overallMsg += `${pos} **${getMember(user).user.tag}** ${overallStats.get(user).toLocaleString()}\n`
        count++
    }

    return new Map().set("wins", winsMsg).set("second", secondMsg).set("third", thirdMsg).set("overall", overallMsg)
}

exports.getServerLeaderboard = getServerLeaderboard

/**
 * @param {Guild} guild
 * @returns {Boolean}
 */
function hasRandomReactionsEnabled(guild) {
    if (enabledCache.has(guild.id)) {
        return enabledCache.get(guild.id)
    }

    const query = db.prepare("SELECT random_start FROM chat_reaction WHERE id = ?").get(guild.id)

    if (query.random_start == 1) {
        enabledCache.set(guild.id, true)
        return true
    } else {
        enabledCache.set(guild.id, false)
        return false
    }
}

exports.hasRandomReactionsEnabled = hasRandomReactionsEnabled

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getRandomChannels(guild) {
    const query = db.prepare("SELECT random_channels FROM chat_reaction WHERE id = ?").get(guild.id)

    return toArray(query.random_channels)
}

exports.getRandomChannels = getRandomChannels

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getBlacklisted(guild) {
    const query = db.prepare("SELECT blacklisted FROM chat_reaction WHERE id = ?").get(guild.id)

    return toArray(query.blacklisted)
}

exports.getBlacklisted = getBlacklisted

/**
 * @param {Guild} guild
 * @param {Array<String>} blacklisted
 */
function setBlacklisted(guild, blacklisted) {
    db.prepare("UPDATE chat_reaction SET blacklisted = ? WHERE id = ?").run(toStorage(blacklisted), guild.id)
}

exports.setBlacklisted = setBlacklisted

/**
 *
 * @param {Guild} guild
 */
function deleteStats(guild) {
    db.prepare("DELETE FROM chat_reaction_stats WHERE guild_id = ?").run(guild.id)
}

exports.deleteStats = deleteStats

/**
 * @returns {Array<String>}
 */
async function getDefaultWords() {
    const res = await fetch(
        "https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/e0d80c53eecd33ea4eed4a5f253da1145fa7951c/chat-reactions.txt"
    )
    const body = await res.text()

    let words = body.split("\n")

    return words
}

function getZeroWidth() {
    return "​"
}

exports.getZeroWidth = getZeroWidth
