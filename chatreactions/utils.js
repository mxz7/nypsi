const { Guild, TextChannel } = require("discord.js")
const fs = require("fs")
const { start } = require("repl")
const { ChatReactionProfile, getZeroWidth } = require("../utils/classes/ChatReaction")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getTimestamp } = require("../utils/utils")
let data = JSON.parse(fs.readFileSync("./chatreactions/data.json"))

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
    date = getTimestamp().split(":").join(".") + " - " + date.getDate() + "." + date.getMonth() + "." + date.getFullYear()
    fs.writeFileSync("./chatreactions/backup/" + date + ".json", JSON.stringify(data))
    console.log("\x1b[32m[" + getTimestamp() + "] chatreactions data backup complete\x1b[37m")
}, 43200000)

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
        const a = await profile.getDefaultWords()

        return a
    } else {
        return profile.wordList
    }
}

exports.getWords = getWords

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
 */
function getReactionStats(guild) {
    const profile = ChatReactionProfile.from(data[guild.id])

    return profile.stats
}

exports.getReactionStats = getReactionStats

/**
 * @param {Guild} guild
 * @param {TextChannel} channel
 */
async function startReaction(guild, channel) {
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

    await channel.send(embed)

    let winners = []

    const filter = m => m.content == chosenWord

    const collector = channel.createMessageCollector(filter, {})
}

exports.startReaction = startReaction