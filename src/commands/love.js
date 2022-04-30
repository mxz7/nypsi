const { Message } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium } = require("../utils/premium/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("love", "calculate your love with another person", categories.FUN)

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("is this person your one true love?!"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        cooldownLength = 1
    }

    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
        }
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
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const prefix = getPrefix(message.guild)

    let target1
    let target2

    if (args.length == 0) {
        target1 = message.member

        const members = []
        const members1 = message.guild.members.cache

        members1.forEach((m) => {
            if (!m.user.bot) {
                if (members.indexOf(m.user.id) == -1) {
                    members.push(m.user.id)
                }
            }
        })

        target2 = members[Math.floor(Math.random() * members.length)]

        target2 = await message.guild.members.fetch(target2)
    } else if (args.length == 1) {
        target1 = message.member

        if (!message.mentions.members.first()) {
            target2 = await getMember(message, args[0])
        } else {
            target2 = message.mentions.members.first()
        }
    } else {
        if (message.mentions.members.size == 2) {
            target1 = message.mentions.members.first()

            target2 = message.mentions.members.get(Array.from(message.mentions.members.keys())[1])
        } else if (message.mentions.members.size == 1) {
            if (args[0].startsWith("<@")) {
                target1 = message.mentions.members.first()

                target2 = await getMember(message, args[1])
            } else {
                target2 = message.mentions.members.first()

                target1 = await getMember(message, args[0])
            }
        } else if (message.mentions.members.size == 0) {
            target1 = await getMember(message, args[0])
            target2 = await getMember(message, args[1])
        } else {
            return send({ embeds: [new ErrorEmbed(`${prefix}love <user> (user)`)] })
        }
    }

    if (!target1 || !target2) {
        return send({ embeds: [new ErrorEmbed("invalid user(s)")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const combo = (parseInt(target1.user.id) + parseInt(target2.user.id)).toString()

    let lovePercent

    if (cache.has(combo)) {
        lovePercent = cache.get(combo)
    } else {
        lovePercent = Math.ceil(Math.random() * 101) - 1

        cache.set(combo, lovePercent)

        setTimeout(() => {
            cache.delete(combo)
        }, 60000)
    }

    let loveLevel
    let loveEmoji
    let loveBar = ""

    if (target1 == target2) {
        lovePercent = 0
    }

    if (lovePercent == 100) {
        loveLevel = "perfect!!"
        loveEmoji = "💞👀🍆🍑"
    } else if (lovePercent == 69) {
        loveLevel = "ooo 69 hehe horny"
        loveEmoji = "🍆🍑💦😩"
    } else if (lovePercent > 90) {
        loveLevel = "perfect!!"
        loveEmoji = "💞👀"
    } else if (lovePercent > 75) {
        loveLevel = "amazing!!"
        loveEmoji = "💕"
    } else if (lovePercent > 55) {
        loveLevel = "good"
        loveEmoji = "💖"
    } else if (lovePercent > 40) {
        loveLevel = "okay"
        loveEmoji = "💝"
    } else if (lovePercent > 25) {
        loveLevel = "uhh.."
        loveEmoji = "❤"
    } else if (lovePercent < 5 && lovePercent != 0) {
        loveLevel = "alone forever"
        loveEmoji = "😭"
    } else if (lovePercent == 0) {
        loveLevel = "lol loner"
        loveEmoji = "😭"
    } else {
        loveLevel = "lets not talk about it.."
        loveEmoji = "💔"
    }

    let loveBarNum = Math.ceil(lovePercent / 10) * 10

    if (loveBarNum == 100) {
        loveBar = "**❤❤❤❤❤❤❤❤❤**"
    } else if (loveBarNum > 90) {
        loveBar = "**❤❤❤❤❤❤❤❤❤** 💔"
    } else if (loveBarNum > 80) {
        loveBar = "**❤❤❤❤❤❤❤❤** 💔💔"
    } else if (loveBarNum > 70) {
        loveBar = "**❤❤❤❤❤❤❤** 💔💔💔"
    } else if (loveBarNum > 60) {
        loveBar = "**❤❤❤❤❤❤** 💔💔💔💔"
    } else if (loveBarNum > 50) {
        loveBar = "**❤❤❤❤❤** 💔💔💔💔💔"
    } else if (loveBarNum > 40) {
        loveBar = "**❤❤❤❤** 💔💔💔💔💔💔"
    } else if (loveBarNum > 30) {
        loveBar = "**❤❤❤** 💔💔💔💔💔💔💔"
    } else if (loveBarNum > 20) {
        loveBar = "**❤❤** 💔💔💔💔💔💔"
    } else if (loveBarNum > 10) {
        loveBar = "**❤** 💔💔💔💔💔💔💔"
    } else {
        loveBar = "💔💔💔💔💔💔💔💔💔💔"
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${target1.user.username} **x** ${target2.user.username}\n\n${loveBar}\n**${lovePercent}**% **-** ${loveLevel} ${loveEmoji}`
    )

    send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
