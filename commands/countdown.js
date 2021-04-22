const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const { getCountdowns, getPrefix, addCountdown } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { formatDate } = require("../utils/utils")

const cmd = new Command("countdown", "create and manage your server countdowns", categories.UTILITY).setAliases(["countdowns"])

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.member.hasPermission("MANAGE_GUILD")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            message.channel.send(new ErrorEmbed("you need the `manage server` permission"))
        }
        return
    }

    if (args.length == 0) {
        const countdowns = getCountdowns(message.guild)

        const embed = new CustomEmbed(message.member, false).setTitle("countdown | " + message.author.username)

        if (Object.keys(countdowns).length == 0) {
            embed.setDescription(`use ${getPrefix(message.guild)}**countdown create** to create a countdown`)
        } else {
            for (let countdown in countdowns) {
                countdown = countdowns[countdown]
                const date = formatDate(new Date(countdown.date).getTime())

                embed.addField(countdown.id, `**id** \`${countdown.id}\`\n**channel** \`${countdown.channel}\`\n**format** ${countdown.format}\n**final format** ${countdown.finalFormat}\n**date** ${date}`)
            }
        }

        embed.setFooter(`use ${getPrefix(message.guild)}countdown help for more commands`)

        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "create" || args[0].toLowerCase() == "new") {

        const countdowns = getCountdowns(message.guild)

        let max = 1

        if (isPremium(message.author.id)) {
            max += getTier(message.author.id)
        }

        if (Object.keys(countdowns).length >= max) {
            let error = `you have reached the maximum amount of countdowns for this server (${max})`

            if (max == 1) {
                error += "\n\nbecome a patreon to upgrade this limt (https://patreon.com/nypsi)"
            } else if (max != 5) {
                error += "\n\nyou can upgrade your subscription to get access to more countdowns per server"
            }

            return message.channel.send(new ErrorEmbed(error))
        }

        const embed = new CustomEmbed(message.member, false, "what date do you want to count down to?\n\nplease use the following format: `MM/DD/YYYY` - example: 12/25/2069")

        await message.channel.send(embed)

        const filter = (msg) => message.author.id == msg.author.id

        let fail = false

        let res = await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ["time"] }).catch(() => {
            return message.channel.send(new ErrorEmbed("you ran out of time - cancelled"))
        })

        if (fail) return

        res = res.first().content.split(" ")[0]

        if (!res.includes("/")) {
            return message.channel.send(new ErrorEmbed("invalid date"))
        }

        if (res.includes(":")) {
            return message.channel.send(new ErrorEmbed("invalid date"))
        }

        const date = new Date(Date.parse(res))

        if (isNaN(date.getTime())) {
            return message.channel.send(new ErrorEmbed("invalid date"))
        }

        const now = new Date().getTime()

        if (date.getTime() < now) {
            return message.channel.send(new ErrorEmbed("unfortunately i cant go back in time"))
        }

        if (date.getTime() - now < 172800000) {
            return message.channel.send(new ErrorEmbed("thats less than 2 days away bro"))
        }

        if (date.getTime() - now > 63072000000) {
            return message.channel.send(new ErrorEmbed("thats more than 2 years away man. i might not live that long").setFooter("so become a patreon 😏"))
        }

        embed.setDescription("which channel would you like to send countdown messages to\n\nplease mention the channel using # - and make sure i have permission to send messages there")

        await message.channel.send(embed)

        res = await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ["time"] }).catch(() => {
            return message.channel.send(new ErrorEmbed("you ran out of time - cancelled"))
        })

        res = res.first()

        if (!res.mentions.channels.first()) {
            return message.channel.send(new ErrorEmbed("invalid channel, please mention the channel using #"))
        }

        const channel = res.mentions.channels.first().id

        embed.setDescription("what format would you like to use?\n\n%days% will be replaced with how many days are left")

        await message.channel.send(embed)

        res = await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ["time"] }).catch(() => {
            return message.channel.send(new ErrorEmbed("you ran out of time - cancelled"))
        })

        res = res.first().content

        if (!res.includes("%days%")) {
            return message.channel.send(new ErrorEmbed("could not find %days%"))
        }

        if (res.length > 250) {
            return message.channel.send(new ErrorEmbed("cannot be longer than 250 characters"))
        }

        const format = res

        embed.setDescription("what final format would you like to use?\n\nthe final format is what will be used on the final day")

        await message.channel.send(embed)

        res = await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ["time"] }).catch(() => {
            return message.channel.send(new ErrorEmbed("you ran out of time - cancelled"))
        })

        res = res.first().content

        if (res.length > 250) {
            return message.channel.send(new ErrorEmbed("cannot be longer than 250 characters"))
        }

        const finalFormat = res

        addCountdown(message.guild, date, format, finalFormat, channel)

        const d = getCountdowns(message.guild)

        embed.setDescription("✅ countdown added")

        return message.channel.send(embed)
    }

}

cmd.setRun(run)

module.exports = cmd