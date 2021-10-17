const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("color", "get a random hex color code", categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let color
    let member

    if (args.length == 0) {
        color = Math.floor(Math.random() * 16777215).toString(16)
        while (color.length != 6) {
            color = Math.floor(Math.random() * 16777215).toString(16)
        }
    }

    if (args.length != 0) {
        if (!message.mentions.members.first()) {
            member = await getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }

        if (!member) {
            color = args[0].split("#").join("")
            if (color.length > 6) {
                color = color.substr(0, 6)
            }
        } else {
            color = member.displayHexColor
        }
    }

    const embed = new CustomEmbed(message.member, false, `[**#${color}**](https://color.tekoh.net/#${color})`)

    try {
        embed.setColor(color)
    } catch {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid color")] })
    }

    if (member) {
        embed.setDescription(member.user.toString())
        embed.setTitle(member.displayHexColor)
        embed.setURL(`https://color.tekoh.net/${member.displayHexColor}`)
    }

    return await message.channel.send({ embeds: [embed] }).catch(() => {
        message.channel.send({ embeds: [new ErrorEmbed("invalid color")] })
    })
}

cmd.setRun(run)

module.exports = cmd
