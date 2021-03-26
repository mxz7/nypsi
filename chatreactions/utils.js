const { Guild, TextChannel, GuildMember } = require("discord.js")
const fs = require("fs")
const fetch = require("node-fetch")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { ChatReactionProfile, getZeroWidth, StatsProfile } = require("../utils/classes/ChatReaction")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getTimestamp } = require("../utils/utils")
let data = JSON.parse(fs.readFileSync("./chatreactions/data.json"))

const currentChannels = new Set()

let timer = 0
let timerCheck = true
setInterval(() => {
    const data1 = JSON.parse(fs.readFileSync("./chatreactions/data.json"))

    if (JSON.stringify(data) != JSON.stringify(data1)) {
        fs.writeFile("./chatreactions/data.json", JSON.stringify(data), (err) => {
            if (err) {
                return console.log(err)
            }
            console.log("\x1b[32m[" + getTimestamp() + "] chatreactions data saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        data = JSON.parse(fs.readFileSync("./chatreactions/data.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] chatreactions data refreshed\x1b[37m")
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        data = JSON.parse(fs.readFileSync("./chatreactions/data.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] chatreactions data refreshed\x1b[37m")
        timer = 0
    }
}, 60000)

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
    fs.writeFileSync("./chatreactions/backup/" + date + ".json", JSON.stringify(data))
    console.log("\x1b[32m[" + getTimestamp() + "] chatreactions data backup complete\x1b[37m")
}, 43200000)

setInterval(async () => {
    const { checkGuild } = require("../nypsi")

    for (let guild in data) {
        const exists = await checkGuild(guild)

        if (!exists) {
            delete data[guild]

            console.log(`[${getTimestamp()}] deleted guild '${guild}' from chatreaction data`)
        }
    }
}, 24 * 60 * 60 * 1000)

/**
 * @param {Guild} guild
 */
function createReactionProfile(guild) {
    const a = new ChatReactionProfile()

    data[guild.id] = a
}

exports.createReactionProfile = createReactionProfile

/**
 * @param {Guild} guild
 */
function hasReactionProfile(guild) {
    if (data[guild.id]) {
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
    const profile = ChatReactionProfile.from(data[guild.id])

    if (profile.wordList.length == 0) {
        const a = await getDefaultWords()

        return a
    } else {
        return profile.wordList
    }
}

exports.getWords = getWords

/**
 * @param {Guild} guild
 * @param {Array<String>} newWordList
 */
async function updateWords(guild, newWordList) {
    data[guild.id].wordList = newWordList
}

exports.updateWords = updateWords

/**
 * @param {Guild} guild
 * @returns {Array<String>}
 */
function getWordList(guild) {
    return data[guild.id].wordList
}

exports.getWordList = getWordList

/**
 * @param {Guild} guild
 * @returns {Boolean}
 */
async function isUsingDefaultWords(guild) {
    if (data[guild.id].wordList.length == 0) {
        return true
    } else {
        return false
    }
}

exports.isUsingDefaultWords = isUsingDefaultWords

/**
 * @param {Guild} guild
 */
function getReactionSettings(guild) {
    const profile = ChatReactionProfile.from(data[guild.id])

    return profile.settings
}

exports.getReactionSettings = getReactionSettings

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

    const now = new Date().getTime()

    let winners = []

    const filter = (m) =>
        m.content == chosenWord && winners.indexOf(m.author.tag) == -1 && !m.member.user.bot

    const timeout = getReactionSettings(guild).timeout

    const collector = channel.createMessageCollector(filter, {
        max: 3,
        time: timeout * 1000,
    })

    collector.on("collect", async (message) => {
        let time = message.createdTimestamp

        time = ((time - now) / 1000).toFixed(2)

        if (winners.length == 0) {
            embed.addField("winners", `🥇 ${message.author.toString()} in \`${time}s\``)

            addWin(guild, message.member)
        } else {
            let badge = "🥈"

            if (winners.length == 2) {
                badge = "🥉"
                add3rdPlace(guild, message.member)
            } else {
                add2ndPlace(guild, message.member)
            }

            const field = await embed.embed.fields.find((f) => f.name == "winners")

            field.value += `\n${badge} ${message.author.toString()} in \`${time}s\``
        }
        winners.push(message.author.tag)
        return await msg.edit(embed)
    })

    collector.on("end", async () => {
        if (winners.length == 0) {
            embed.setDescription(embed.embed.description + "\n\nnobody won ):")
        }
        await msg.edit(embed)
        currentChannels.delete(channel.id)
    })
}

exports.startReaction = startReaction

function hasReactionStatsProfile(guild, member) {
    if (data[guild.id].stats[member.user.id]) {
        return true
    } else {
        return false
    }
}

exports.hasReactionStatsProfile = hasReactionStatsProfile

function createReactionStatsProfile(guild, member) {
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
 * @returns {Map}
 */
async function getServerLeaderboard(guild) {
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

    for (const user in data[guild.id].stats) {
        if (
            members.find((member) => member.user.id == user) &&
            data[guild.id].stats[user].wins != 0
        ) {
            usersWins.push(user)
        }
        if (
            members.find((member) => member.user.id == user) &&
            data[guild.id].stats[user].secondPlace != 0
        ) {
            usersSecond.push(user)
        }
        if (
            members.find((member) => member.user.id == user) &&
            data[guild.id].stats[user].thirdPlace != 0
        ) {
            usersThird.push(user)
        }
    }

    const getMember = (id) => {
        const target = members.find((member) => member.user.id == id)

        return target
    }

    usersWins.sort((a, b) => {
        return data[guild.id].stats[b] - data[guild.id].stats[a]
    })

    usersSecond.sort((a, b) => {
        return data[guild.id].stats[b] - data[guild.id].stats[a]
    })

    usersThird.sort((a, b) => {
        return data[guild.id].stats[b] - data[guild.id].stats[a]
    })

    usersWins.splice(5, usersWins.length - 5)
    usersSecond.splice(5, usersSecond.length - 5)
    usersThird.splice(5, usersThird.length - 5)

    let winsMsg = ""
    let secondMsg = ""
    let thirdMsg = ""

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

        winsMsg += `${pos} **${getMember(user).user.tag}** ${data[guild.id].stats[user].wins}`
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
        }`
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
        }`
        count++
    }

    const d = new Map()

    return new Map().set("wins", winsMsg).set("second", secondMsg).set("third", thirdMsg)
}

exports.getServerLeaderboard = getServerLeaderboard

/**
 * @returns {Array<String>}
 */
async function getDefaultWords() {
    const res = await fetch(
        "https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt"
    )
    const body = await res.text()

    let words = body.split("\n")

    return words
}
