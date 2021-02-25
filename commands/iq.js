const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("iq", "accurate prediction of your iq", categories.FUN)

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 5 - diff

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
    }, 5000)

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

    let iq
    let iqMsg

    if (cache.has(member.user.id)) {
        iq = cache.get(member.user.id)
    } else {
        const chance = Math.floor(Math.random() * 30)

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
        }, 60000)
    }

    if (iq < 80) {
        iqMsg = "you're a rock :rock:"
    } else if (iq < 90) {
        iqMsg = "u probably push on doors that say pull"
    } else if (iq < 98) {
        iqMsg = "dumbass.. 🤣"
    } else if (iq < 103) {
        iqMsg = "average 🙄"
    } else if (iq < 120) {
        iqMsg = "big brain"
    } else if (iq < 400) {
        iqMsg = "nerd 🤓"
    } else if (iq == 69) {
        iqMsg = "😉😏🍆🍑"
    } else if (iq == 420) {
        iqMsg = "🚬🍁🍂"
    }

    const embed = new CustomEmbed(message.member, false, `${member.user.toString()}\n\n**${iq}** IQ 🧠\n${iqMsg}`)
        .setTitle("iq calculator")
    
    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd