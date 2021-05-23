const { Message } = require("discord.js")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getWholesomeImage, suggestWholesomeImage, formatDate, acceptWholesomeImage, denyWholesomeImage, deleteFromWholesome, clearWholesomeCache, getMember } = require("../utils/utils")
const { getPrefix } = require("../utils/guilds/utils")
const e = require("express")

const cooldown = new Map()

const cmd = new Command("wholesome", "get a random wholesome picture", categories.FUN).setAliases([
    "iloveyou",
    "loveyou",
    "loveu",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7

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

    const embed = new CustomEmbed(message.member)

    let target

    if (args.length == 0) {
        const image = getWholesomeImage()

        embed.setHeader(`<3 | ${image.id}`)
        embed.setImage(image.image)
    } else if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "suggest" || args[0].toLowerCase() == "+") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${getPrefix(message.guild)}wholesome suggest <imgur url>`))
        }

        const url = args[1].toLowerCase()

        if (!url.startsWith("https://i.imgur.com/")) {
            return message.channel.send(new ErrorEmbed("must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"))
        }

        const res = await suggestWholesomeImage(message.member, args[1])

        if (!res) {
            return message.channel.send(new ErrorEmbed(`error: maybe that image already exists? if this persists join the ${getPrefix(message.guild)}support server`))
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "get") {
        if (message.author.id != "672793821850894347") return

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("dumbass"))
        }

        const wholesome = getWholesomeImage(parseInt(args[1]))

        if (!wholesome) {
            return message.react("❌")
        }

        embed.setTitle(`image #${wholesome.id}`)

        embed.setDescription(`**suggested by** ${wholesome.submitter} (${wholesome.submitter_id})\n**accepted by** \`${wholesome.accepter}\`\n**url** ${wholesome.image}`)
        embed.setImage(wholesome.image)
        embed.setFooter(`submitted on ${formatDate(new Date(wholesome.date))}`)
    } else if (args[0].toLowerCase() == "accept") {
        if (message.guild.id != "747056029795221513") return

        const roles = message.member.roles.cache

        let allow = false

        if (roles.has("747056620688900139")) allow = true
        if (roles.has("747059949770768475")) allow = true

        if (!allow) return

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("you must include the suggestion id"))
        }

        const res = await acceptWholesomeImage(parseInt(args[1]), message.member)

        if (!res) {
            return message.channel.send(new ErrorEmbed(`couldnt find a suggestion with id ${args[1]}`))
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "deny") {
        if (message.guild.id != "747056029795221513") return

        const roles = message.member.roles.cache

        let allow = false

        if (roles.has("747056620688900139")) allow = true
        if (roles.has("747059949770768475")) allow = true

        if (!allow) return

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("you must include the suggestion id"))
        }

        const res = await denyWholesomeImage(parseInt(args[1]))

        if (!res) {
            return message.channel.send(
                new ErrorEmbed(`couldnt find a suggestion with id ${args[1]}`)
            )
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "delete") {
        if (message.author.id != "672793821850894347") return

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("dumbass"))
        }

        const res = await deleteFromWholesome(parseInt(args[1]))

        if (!res) {
            return message.react("❌")
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "reload") {
        if (message.author.id != "672793821850894347") return

        clearWholesomeCache()

        return message.react("✅")
    } else {
        let member

        if (!message.mentions.members.first()) {
            member = await getMember(message, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }

        if (member) {
            target = member
        } else {
            return message.channel.send(new ErrorEmbed("couldnt find that member ):"))
        }
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (target) {
        return message.channel.send(`${target.user.toString()} you've received a wholesome image (:`, embed)
    }

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
