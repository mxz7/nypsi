const { Message } = require("discord.js")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getMember } = require("../utils/utils")
const { updateBalance, getBalance, userExists, createUser } = require("../utils/economy/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("hot", "measure how hot you are", categories.FUN).setAliases(["howhot", "sexy"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
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
            return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
        }
    }

    if (!userExists(member)) createUser(member)

    if (isPremium(member.user.id)) {
        cacheTime = 25
    }

    let hotAmount

    if (cache.has(member.user.id)) {
        hotAmount = cache.get(member.user.id)
    } else {
        hotAmount = Math.ceil(Math.random() * 101) - 1

        cache.set(member.user.id, hotAmount)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    let hotText = ""
    let hotEmoji = ""

    if (hotAmount >= 95) {
        hotEmoji = "💰🍆💪😍😘"
        hotText =
            "HEY THERE what does it take to marry you. look. ill give you money. here. ive got big muscles too. im 6'2. please."

        if (cache.has(member.user.id)) {
            cache.delete(member.user.id)
            updateBalance(member, getBalance(member) + 1069)
        }
    } else if (hotAmount >= 80) {
        hotEmoji = "💍😍"
        hotText = "marry me wifey"
    } else if (hotAmount >= 60) {
        hotEmoji = "😳😏🥺"
        hotText = "hey there baby girl.. ahaha..."
    } else if (hotAmount >= 45) {
        hotEmoji = "😳😳🥺"
        hotText = "hey hey dam u kinda cute"
    } else if (hotAmount >= 35) {
        hotEmoji = "🥵"
        hotText = "whats ur sc"
    } else if (hotAmount >= 25) {
        hotEmoji = "🍆"
        hotText = "fuckable"
    } else if (hotAmount >= 15) {
        hotEmoji = "🤓"
        hotText = "nerd."
    } else {
        hotEmoji = "🙄"
        hotText = "ugly."
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n**${hotAmount}**% hot ${hotEmoji}\n${hotText}`
    ).setTitle("hotness calculator")

    if (hotAmount >= 95) {
        embed.setFooter("+$1,069")
    }

    return await message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
