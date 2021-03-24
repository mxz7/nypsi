const { Message } = require("discord.js")
const { isPremium } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("sex", "find horny milfs in ur area 😏", categories.FUN).setAliases(["findhornymilfsinmyarea", "milffinder", "findamilf"])

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
            guild: message.guild,
            channel: message.channel.id,
            date: new Date().getTime()
        }

        looking.set(message.author.id, obj)
    }

    if (looking.length == 0) {
        addToLooking()
        return message.channel.send(new CustomEmbed(message.member, false, "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found").setTitle(`milf finder | ${message.author.username}`))
    } else {
        if (looking.has(message.author.id)) {
            return message.channel.send(new ErrorEmbed("we're already searching for a match.. calm down you horny shit"))
        }

        for (let key of looking.keys()) {
            key = looking.get(key)

            if (message.guild.id == key.guild.id) continue

            looking.delete(key.user.id)

            await message.channel.send(new CustomEmbed(message.member, true, `a match has been made from **${key.guild.name}**\n\n` +
            `send **${key.user.tag}** a *private* message 😉😏`).setTitle(`milf finder | ${message.author.username}`))

            const channel = await key.guild.channels.cache.find(ch => ch.id == key.channel)

            return await channel.send(key.user.toString() + " a match has been found", new CustomEmbed(undefined, true, `a match has been made from **${message.guild.name}**\n\nsend **${message.author.tag}** a *private* message 😉😏`).setTitle(`milf finder | ${key.user.username}`).setColor("#5efb8f"))
        }

        addToLooking()
        return message.channel.send(new CustomEmbed(message.member, false, "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found").setTitle(`milf finder | ${message.author.username}`))
    }

}

cmd.setRun(run)

module.exports = cmd

setInterval(() => {
    if (looking.size == 0) return

    const now = new Date().getTime()

    const expire = 10800000

    looking.forEach(async obj => {
        if (now - obj.date >= expire) {
            await obj.user.send(new CustomEmbed(undefined, false, "unfortunately we couldn't find you a milf 😢").setColor("#e4334f").setTitle("milf finder"))
            looking.delete(obj.user.id)
        }
    })
}, 600000)