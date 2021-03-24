const { Message } = require("discord.js")
const { isPremium } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("sex", "find horny milfs in ur area 😏", categories.FUN).setAliases(["findhornymilfsinmyarea"])

const cooldown = new Map()
const looking = new Map()

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        cooldownLength = 10
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

    const addToLooking = () => {
        const obj = {
            user: message.author,
            guild: message.guild.id,
            guildName: message.guild.name,
            date: new Date().getTime()
        }

        looking.set(message.author.id, obj)
    }

    if (looking.length == 0) {
        addToLooking()
        return message.channel.send(new CustomEmbed(message.member, false, "you have been signed up as looking for sex ✅😏 we will notify you when a match has been made").setTitle("milf finder"))
    } else {

        if (looking.has(message.author.id)) {
            return message.channel.send(new ErrorEmbed("we're already searching for a match for you.. calm down you horny shit"))
        }

        for (let key of looking.keys()) {
            key = looking.get(key)

            if (message.guild.id == key.guild) continue

            const embed = new CustomEmbed(message.member, true, `a match has been made from the city of **${key.guildName}**\n\n` +
                `send **${key.user.tag}** a *private* messag 😉😏`)

            return message.channel.send(embed)
        }

        addToLooking()
        return message.channel.send(new CustomEmbed(message.member, false, "you have been signed up as looking for sex ✅😏 we will notify you when a match has been made").setTitle("milf finder"))

        
    }

}

cmd.setRun(run)

module.exports = cmd