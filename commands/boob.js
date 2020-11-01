const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("boob", "accurate prediction of your boob size", categories.FUN)

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
            member = getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }

        if (!member) {
            return message.channel.send(new ErrorEmbed("invalid user"))
        }
    }

    
    const letters = ["AA", "A", "B", "C", "D", "DD"]

    let sizeMsg = ""
    let sizeEmoji = ""

    if (cache.has(member.user.id)) {
        sizeMsg = cache.get(member.user.id).msg
        sizeEmoji = cache.get(member.user.id).emoji
    } else {
        let size

        size = Math.floor(Math.random() * 18) + 30

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
            emoji: sizeEmoji
        })

        setTimeout(() => {
            cache.delete(member.user.id)
        }, 60000)
    }

    const embed = new CustomEmbed(message.member, false)
        .setTitle("boob calculator")
        .setDescription(member.user.toString() + `\n${sizeMsg}\n${sizeEmoji}`)
    
    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd