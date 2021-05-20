const { Guild, TextChannel, GuildMember } = require("discord.js")
const fs = require("fs")
const fetch = require("node-fetch")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { ChatReactionProfile, getZeroWidth, StatsProfile } = require("../classes/ChatReaction")
const { CustomEmbed } = require("../classes/EmbedBuilders")
const { info, types, getTimestamp } = require("../logger")
const { getDatabase, toArray, toStorage } = require("../database/database")
let data = JSON.parse(fs.readFileSync("./utils/chatreactions/data.json"))
info(
    `${Array.from(Object.keys(data)).length.toLocaleString()} chatreaction guilds loaded`,
    types.DATA
)
const db = getDatabase()

const currentChannels = new Set()
const existsCache = new Set()
const lastGame = new Map()

let timer = 0
let timerCheck = true
setInterval(() => {
    const data1 = JSON.parse(fs.readFileSync("./utils/chatreactions/data.json"))

    if (JSON.stringify(data) != JSON.stringify(data1)) {
        fs.writeFile("./utils/chatreactions/data.json", JSON.stringify(data), (err) => {
            if (err) {
                return console.log(err)
            }
            info("chatreactions data saved", types.DATA)
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        data = JSON.parse(fs.readFileSync("./utils/chatreactions/data.json"))
        info("chatreactions data refreshed", types.DATA)
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        data = JSON.parse(fs.readFileSync("./utils/chatreactions/data.json"))
        info("chatreactions data refreshed", types.DATA)
        timer = 0
    }
}, 60000 + Math.floor(Math.random() * 60) * 1000)

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
    fs.writeFileSync("./utils/chatreactions/backup/" + date + ".json", JSON.stringify(data))
    info("chatreactions data backup complete", types.DATA)
}, 43200000)

setInterval(async () => {
    const { checkGuild, getGuild } = require("../../nypsi")

    for (let guild in data) {
        const exists = await checkGuild(guild)

        if (!exists) {
            delete data[guild]

            info(`deleted guild '${guild}' from chatreaction data`, types.DATA)
        }
    }
}, 24 * 60 * 60 * 1000)

setInterval(async () => {
    let count = 0

    /**
     * @param {Guild} guild
     * @param {TextChannel} channel
     */
    const runGame = async (guild, channel) => {
        const messages = await channel.messages.fetch({ limit: 10 })
        let stop = false

        await messages.forEach((m) => {
            if (m.author.id == guild.client.user.id) {
                if (m.embeds[0].title == "chat reaction") {
                    stop = true
                    return
                }
            }
        })

        if (stop) {
            return
        }

        const a = await startReaction(guild, channel)

        if (a != "xoxo69") {
            count++
        } else {
            return
        }

        const settings = getReactionSettings(guild)

        const base = settings.timeBetweenEvents
        let final

        if (settings.randomModifier == 0) {
            final = base
        } else {
            const o = ["+", "-"]
            let operator = o[Math.floor(Math.random() * o.length)]

            if (base - settings.randomModifier < 120) {
                operator = "+"
            }

            const amount = Math.floor(Math.random() * settings.randomModifier)

            if (operator == "+") {
                final = base + amount
            } else {
                final = base - amount
            }
        }

        const nextGame = new Date().getTime() + final * 1000

        return lastGame.set(channel.id, nextGame)
    }

    for (const guildID in data) {
        const { getGuild } = require("../../nypsi")
        const guild = await getGuild(guildID)
        const guildData = ChatReactionProfile.from(data[guildID])

        if (!guildData.settings.randomStart) continue

        if (!guild) {
            console.log("no guild [chat reaction] ", guildID)
            continue
        }

        const channels = guildData.settings.randomChannels

        if (channels.length == 0) {
            data[guildID].settings.randomStart = false
        }

        const now = new Date().getTime()

        for (const ch of channels) {
            if (lastGame.has(ch)) {
                if (now >= lastGame.get(ch)) {
                    const channel = await guild.channels.cache.find((cha) => cha.id == ch)

                    if (!channel) {
                        channels.splice(channels.indexOf(ch), 1)
                        data[guildID].settings.randomChannels = channels
                        continue
                    }

                    await runGame(guild, channel)
                }
            } else {
                const channel = await guild.channels.cache.find((cha) => cha.id == ch)

                if (!channel) {
                    channels.splice(channels.indexOf(ch), 1)
                    data[guildID].settings.randomChannels = channels
                    continue
                }

                await runGame(guild, channel)
            }
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
    const query = db.prepare("SELECT random_start, random_channels, between_events, random_modifier, timeout FROM chat_reaction WHERE id = ?").get(guild.id)

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
 * @param {Object} settings
 */
function updateReactionSettings(guild, settings) {
    data[guild.id].settings = settings
}

exports.updateReactionSettings = updateReactionSettings

/**
 * @param {Guild} guild
 * @param {GuildMember} member
 * @returns {StatsProfile}
 */
function getReactionStats(guild, member) {
    const profile = ChatReactionProfile.from(data[guild.id])

    return profile.stats[member.user.id]
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

    const embed = new CustomEmbed().setColor("#5efb8f")

    embed.setTitle("chat reaction")
    embed.setDescription(`type: \`${displayWord}\``)

    const msg = await channel.send(embed)

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

    const collector = channel.createMessageCollector(filter, {
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

        if (!hasReactionStatsProfile(guild, message.member))
            createReactionStatsProfile(guild, message.member)

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
                        const field = await embed.embed.fields.find((f) => f.name == "winners")

                        field.value += `\n🥈 ${winners.get(2).mention} in \`${
                            winners.get(2).time
                        }s\``

                        add2ndPlace(guild, winners.get(2).member)

                        if (winners.get(3)) {
                            field.value += `\n🥉 ${winners.get(3).mention} in \`${
                                winners.get(3).time
                            }s\``
                            add3rdPlace(guild, winners.get(3).member)
                        }

                        return await msg.edit(embed).catch(() => {
                            collector.stop()
                        })
                    }
                }, 750)
            } else {
                if (!waiting) {
                    const field = await embed.embed.fields.find((f) => f.name == "winners")

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
            return await msg.edit(embed).catch(() => {
                collector.stop()
            })
        }
    })

    collector.on("end", () => {
        currentChannels.delete(channel.id)
        setTimeout(async () => {
            if (winners.size == 0) {
                embed.setDescription(embed.embed.description + "\n\nnobody won ):")
            } else if (winners.size == 1) {
                embed.setFooter("ended with 1 winner")
            } else {
                embed.setFooter(`ended with ${winners.size} winners`)
            }
            await msg.edit(embed).catch(() => {})
        }, 500)
    })
}

exports.startReaction = startReaction

function hasReactionStatsProfile(guild, member) {
    if (!data[guild.id].stats) return false

    if (data[guild.id].stats[member.user.id]) {
        return true
    } else {
        return false
    }
}

exports.hasReactionStatsProfile = hasReactionStatsProfile

function createReactionStatsProfile(guild, member) {
    if (!data[guild.id].stats) {
        data[guild.id].stats = {}
    }
    data[guild.id].stats[member.user.id] = new StatsProfile()
}

exports.createReactionStatsProfile = createReactionStatsProfile

/**
 * @param {Guild} guild
 * @param {GuildMember} member
 * @param {StatsProfile} stats
 */
function updateStats(guild, member, newStats) {
    data[guild.id].stats[member.user.id] = newStats
}

exports.updateStats = updateStats

function addWin(guild, member) {
    data[guild.id].stats[member.user.id].wins++
}

exports.addWin = addWin

function add2ndPlace(guild, member) {
    data[guild.id].stats[member.user.id].secondPlace++
}

exports.add2ndPlace = add2ndPlace

function add3rdPlace(guild, member) {
    data[guild.id].stats[member.user.id].thirdPlace++
}

exports.add3rdPlace = add3rdPlace

/**
 * @param {Guild} guild
 * @param {Number} amount
 * @returns {Map}
 */
async function getServerLeaderboard(guild, amount) {
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
    const usersSecond = []
    const usersThird = []
    const overallWins = []

    for (const user in data[guild.id].stats) {
        let overall = false
        if (
            members.find((member) => member.user.id == user) &&
            data[guild.id].stats[user].wins != 0
        ) {
            usersWins.push(user)
            overall = true
        }
        if (
            members.find((member) => member.user.id == user) &&
            data[guild.id].stats[user].secondPlace != 0
        ) {
            usersSecond.push(user)
            overall = true
        }
        if (
            members.find((member) => member.user.id == user) &&
            data[guild.id].stats[user].thirdPlace != 0
        ) {
            usersThird.push(user)
            overall = true
        }

        if (overall) {
            overallWins.push(user)
        }
    }

    const getMember = (id) => {
        const target = members.find((member) => member.user.id == id)

        return target
    }

    usersWins.sort((a, b) => {
        return data[guild.id].stats[b].wins - data[guild.id].stats[a].wins
    })

    usersSecond.sort((a, b) => {
        return data[guild.id].stats[b].secondPlace - data[guild.id].stats[a].secondPlace
    })

    usersThird.sort((a, b) => {
        return data[guild.id].stats[b].thirdPlace - data[guild.id].stats[a].thirdPlace
    })

    overallWins.sort((a, b) => {
        const aTotal =
            data[guild.id].stats[a].wins +
            data[guild.id].stats[a].secondPlace +
            data[guild.id].stats[a].thirdPlace

        const bTotal =
            data[guild.id].stats[b].wins +
            data[guild.id].stats[b].secondPlace +
            data[guild.id].stats[b].thirdPlace

        return bTotal - aTotal
    })

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

        winsMsg += `${pos} **${getMember(user).user.tag}** ${data[guild.id].stats[user].wins}\n`
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

        secondMsg += `${pos} **${getMember(user).user.tag}** ${
            data[guild.id].stats[user].secondPlace
        }\n`
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

        thirdMsg += `${pos} **${getMember(user).user.tag}** ${
            data[guild.id].stats[user].thirdPlace
        }\n`
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

        overallMsg += `${pos} **${getMember(user).user.tag}** ${(
            data[guild.id].stats[user].wins +
            data[guild.id].stats[user].secondPlace +
            data[guild.id].stats[user].thirdPlace
        ).toLocaleString()}\n`
        count++
    }

    return new Map()
        .set("wins", winsMsg)
        .set("second", secondMsg)
        .set("third", thirdMsg)
        .set("overall", overallMsg)
}

exports.getServerLeaderboard = getServerLeaderboard

/**
 * @param {Guild} guild
 * @returns {Boolean}
 */
function hasRandomReactionsEnabled(guild) {
    if (data[guild.id].settings.randomStart) {
        return true
    } else {
        return false
    }
}

exports.hasRandomReactionsEnabled = hasRandomReactionsEnabled

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getRandomChannels(guild) {
    return data[guild.id].settings.randomChannels
}

exports.getRandomChannels = getRandomChannels

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getBlacklisted(guild) {
    return data[guild.id].blacklisted
}

exports.getBlacklisted = getBlacklisted

/**
 * @param {Guild} guild
 * @param {Array<String>} blacklisted
 */
function setBlacklisted(guild, blacklisted) {
    data[guild.id].blacklisted = blacklisted
}

exports.setBlacklisted = setBlacklisted

/**
 *
 * @param {Guild} guild
 */
function deleteStats(guild) {
    delete data[guild.id].stats
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
