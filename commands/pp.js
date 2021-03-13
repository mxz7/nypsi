const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { isPremium, getTier } = require("../premium/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("pp", "accurate prediction of your pp size", categories.FUN).setAliases(["penis"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    let cooldownLength = 5

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

    let size
    let sizeMsg = "8"

    if (cache.has(member.user.id)) {
        size = cache.get(member.user.id)
    } else {
        size = Math.floor(Math.random() * 15)

        let chance = 45

        if (isPremium(member.user.id)) {
            if (getTier(member.user.id) >= 3) {
                chance = 10
            }
        }

        const bigInch = Math.floor(Math.random() * chance)

        if (bigInch == 7) {
            size = Math.floor(Math.random() * 54) + 15
        }
        
        cache.set(member.user.id, size)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, 60000)
    }

    for (let i = 0; i < size; i++) {
        sizeMsg = sizeMsg + "="
    }
    
    sizeMsg = sizeMsg + "D"

    const embed = new CustomEmbed(message.member, false, `${member.user.toString()}\n${sizeMsg}\n📏 ${size} inches`)
        .setTitle("pp predictor 1337")
    
    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd