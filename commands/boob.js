const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { isPremium } = require("../utils/premium/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("boob", "accurate prediction of your boob size", categories.FUN).setAliases(["howbigaremyboobies"])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how big are your boobies"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7
    let cacheTime = 60

    if (isPremium(message.author.id)) {
        cooldownLength = 1
        cacheTime = 25
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
            return send({ embeds: [new ErrorEmbed("invalid user")] })
        }
    }

    if (isPremium(member.user.id)) {
        cacheTime = 25
    }

    const letters = ["AA", "A", "B", "C", "D", "DD"]

    let sizeMsg = ""
    let sizeEmoji = ""

    if (cache.has(member.user.id)) {
        sizeMsg = cache.get(member.user.id).msg
        sizeEmoji = cache.get(member.user.id).emoji
    } else {
        let size

        size = Math.floor(Math.random() * 9) * 2 + 30

        const index = Math.floor(Math.random() * letters.length)

        let letter = letters[index]

        if (index > 4) {
            sizeEmoji = "🍈"
        } else if (index > 2) {
            sizeEmoji = "🍒"
        } else {
            sizeEmoji = "🥞"
        }

        sizeMsg = `${size}${letter}`

        cache.set(member.user.id, {
            msg: sizeMsg,
            emoji: sizeEmoji,
        })

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    const embed = new CustomEmbed(message.member, false)
        .setTitle("boob calculator")
        .setDescription(member.user.toString() + `\n${sizeMsg}\n${sizeEmoji}`)

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
