const { Message } = require("discord.js")
const { getPrefix } = require("../guilds/utils")
const { isPremium } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("createpalette", "create a color palette for color.tekoh.net from role colors", categories.INFO).setAliases(["palette", "rolepalette"])

const cooldown = new Map()

const regex = /[^a-f0-9]/g

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 15 - diff

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

    if (!isPremium(message.author.id)) {
        return message.channel.send(new ErrorEmbed("you must be a patreon for this command"))
    }

    if (!message.guild.me.hasPermission("MANAGE_ROLES")) {
        return message.channel.send(new ErrorEmbed("i need the `manage roles` permission for this command to work"))
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false, "create a color palette from the roles in the server, uses https://color.tekoh.net")

        embed.setTitle("create palette")
        embed.addField("usage", `${getPrefix(message.guild)}palette <name> <background color>\nuse _ (underscores) for spaces in name, you can use ${getPrefix(message.guild)}color to find a color, or an [online color picker tool](https://color.tekoh.net)`)
        embed.addField("example", `${getPrefix(message.guild)}palette my_palette #ff0000`)
        return message.channel.send(embed)
    }

    let roles = await message.guild.roles.fetch()
    roles = roles.cache

    const colors = []
    
    await roles.forEach(r => {
        if (colors.length >= 100) return
        if (r.hexColor != "#000000") {
            colors.push(r.hexColor)
        }
    })

    if (colors.length < 3) {
        return message.channel.send(new ErrorEmbed("there aren't enough role colors to make a palette (minimum of 3)"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 15 * 1000)

    // http://127.0.0.1:5500/#!#ff0000!#00ff00!#0000ff&?test&?#777777

    let url = "https://color.tekoh.net/#!"

    url += colors.join("!")

    url += `&?${args[0]}`

    let color = args[1]

    if (!color) {
        color = Math.floor(Math.random() * 16777215).toString(16)
        while (color.length != 6) {
            color = Math.floor(Math.random() * 16777215).toString(16)
        }
    } else {
        if (color.startsWith("#")) {
            color = color.substr(1, color.length)
        }

        if (color.length != 6) {
            return message.channel.send(new ErrorEmbed(`invalid color, you can use ${getPrefix(message.guild)}color to find a color, or an [online color picker tool](https://color.tekoh.net)`))
        }

        if (color.match(regex)) {
            return message.channel.send(new ErrorEmbed(`invalid color, you can use ${getPrefix(message.guild)}color to find a color, or an [online color picker tool](https://color.tekoh.net)`))
        }
    }

    url += `&?#${color}`

    return message.channel.send(new CustomEmbed(message.member, true, url))
}

cmd.setRun(run)

module.exports = cmd