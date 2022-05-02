import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")
const { isPremium, getTier } = require("../utils/premium/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("iq", "accurate prediction of your iq", Categories.FUN)

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how large is your iq"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 7
    let cacheTime = 60

    if (isPremium(message.author.id)) {
        cooldownLength = 1
        cacheTime = 25
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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let iq
    let iqMsg

    if (cache.has(member.user.id)) {
        iq = cache.get(member.user.id)
    } else {
        let chanceAmount = 25

        if (isPremium(member.user.id)) {
            if (getTier(member.user.id) >= 3) {
                chanceAmount = 10
            }
        }

        const chance = Math.floor(Math.random() * chanceAmount)

        if (chance == 7) {
            const chance2 = Math.floor(Math.random() * 10)

            if (chance2 > 5) {
                iq = Math.floor(Math.random() * 20)
            } else {
                iq = (Math.floor(Math.random() * 8) + 2) * 100
            }
        } else if (chance == 6) {
            iq = 69
        } else if (chance == 5) {
            iq = 420
        } else {
            iq = Math.floor(Math.random() * 40) + 80
        }

        cache.set(member.user.id, iq)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    if (iq == 69) {
        iqMsg = "😉😏🍆🍑"
    } else if (iq < 80) {
        iqMsg = "you're a rock :rock:"
    } else if (iq < 90) {
        iqMsg = "u probably push doors that say pull"
    } else if (iq < 98) {
        iqMsg = "dumbass.. 🤣"
    } else if (iq < 103) {
        iqMsg = "average 🙄"
    } else if (iq < 120) {
        iqMsg = "big brain"
    } else if (iq < 400) {
        iqMsg = "nerd 🤓"
    } else if (iq == 420) {
        iqMsg = "🚬🍁🍂"
    } else {
        iqMsg = "uh. woah."
    }

    const embed = new CustomEmbed(message.member, false, `${member.user.toString()}\n\n**${iq}** IQ 🧠\n${iqMsg}`).setTitle(
        "iq calculator"
    )

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
