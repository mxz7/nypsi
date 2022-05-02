import { Message } from "discord.js"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const { getMember } = require("../utils/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("horny", "measure how horny you are", Categories.FUN).setAliases([
    "howhorny",
    "fuckmedaddy",
    "makemecum",
])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how horny are u"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 7
    let cacheTime = 60

    if (isPremium(message.author.id)) {
        cooldownLength = 1
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
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

    let hornyAmount

    if (cache.has(member.user.id)) {
        hornyAmount = cache.get(member.user.id)
    } else {
        hornyAmount = Math.ceil(Math.random() * 101) - 1

        cache.set(member.user.id, hornyAmount)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    let hornyText = ""
    let hornyEmoji = ""

    if (hornyAmount >= 95) {
        hornyEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜"
        hornyText = "FUCK ME NOW. DADDY."
    } else if (hornyAmount >= 80) {
        hornyEmoji = "🍆💦🤤"
        hornyText = "hey let me help you pleaseeee"
    } else if (hornyAmount >= 60) {
        hornyEmoji = "🍆✊ 😼👈"
        hornyText = "hehe u kinda turning me on"
    } else if (hornyAmount >= 45) {
        hornyEmoji = "😏🍆"
        hornyText = "i see your incognito tab"
    } else if (hornyAmount >= 35) {
        hornyEmoji = "👉👌"
        hornyText = "dirty thoughts"
    } else if (hornyAmount >= 25) {
        hornyEmoji = "🍆"
        hornyText = "hehe u can do better than that"
    } else if (hornyAmount >= 15) {
        hornyEmoji = "😐"
        hornyText = "cum on man."
    } else {
        hornyEmoji = "🙄"
        hornyText = "ur so innocent. boring."
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n**${hornyAmount}**% horny ${hornyEmoji}\n${hornyText}`
    ).setTitle("horny calculator")

    return await send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
