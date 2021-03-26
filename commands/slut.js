const { Message } = require("discord.js")
const { isPremium } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getMember } = require("../utils/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("slut", "measure how much of a slut you are", categories.FUN).setAliases([
    "howslut",
    "whore",
    "cumslut",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 5
    let cacheTime = 60

    if (isPremium(message.author.id)) {
        cooldownLength = 1
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }

        if (!member) {
            return message.channel.send(new ErrorEmbed("invalid user"))
        }
    }

    if (isPremium(member.user.id)) {
        cacheTime = 25
    }

    let slutAmount

    if (cache.has(member.user.id)) {
        slutAmount = cache.get(member.user.id)
    } else {
        slutAmount = Math.ceil(Math.random() * 101) - 1

        cache.set(member.user.id, slutAmount)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    let slutText = ""
    let slutEmoji = ""

    if (slutAmount >= 95) {
        slutEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜"
        slutText = "whore ass hooker cumslut cousin fucker sweet home alabama"
    } else if (slutAmount >= 80) {
        slutEmoji = "🍆🍒🍑😈 👉👌"
        slutText = "pornhub and onlyfans is your family business"
    } else if (slutAmount >= 60) {
        slutEmoji = "🍆👉👌💦"
        slutText = "took 12 loads in one sitting"
    } else if (slutAmount >= 45) {
        slutEmoji = "👉👌💦"
        slutText = "princess cumslut"
    } else if (slutAmount >= 35) {
        slutEmoji = "🍆✊"
        slutText = "you would fuck anyone"
    } else if (slutAmount >= 25) {
        slutEmoji = "🍆🧎‍♂️"
        slutText = "still a whore"
    } else if (slutAmount >= 15) {
        slutEmoji = "🍑"
        slutText = "average 🙄"
    } else {
        slutEmoji = "🤐"
        slutText = "virgin"
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n**${slutAmount}**% slut ${slutEmoji}\n${slutText}`
    ).setTitle("slut calculator")

    return await message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
