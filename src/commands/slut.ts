import { Message } from "discord.js"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const { getMember } = require("../utils/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("slut", "measure how much of a slut you are", Categories.FUN).setAliases([
    "howslut",
    "whore",
    "cumslut",
])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("are you slutty 😳"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message, args: string[]) {
    let cooldownLength = 7
    let cacheTime = 60

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
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

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

    return await send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
