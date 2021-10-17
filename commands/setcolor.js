const { Message } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier, getEmbedColor, setEmbedColor } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("setcolor", "set the color of the bot's messages (premium only)", categories.UTILITY).setAliases([
    "setcolour",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!isPremium(message.author.id)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("you must be a BRONZE tier patreon for this command\n\nhttps://www.patreon.com/nypsi")],
        })
    }

    if (getTier(message.author.id) < 1) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed(
                    "you must be atleast BRONZE tier for this command, you are BRONZE\n\nhttps://www.patreon.com/nypsi"
                ),
            ],
        })
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)

        embed.setDescription(`**color** #${getEmbedColor(message.author.id)}\n\nuse \`${getPrefix(
            message.guild
        )}setcolor <hex color code>\` to change this
        you can use ${getPrefix(
            message.guild
        )}color to find a color, or an [online color picker tool](https://color.tekoh.net)`)

        return message.channel.send({ embeds: [embed] })
    }

    let color = args[0].split("#").join("")

    if (color.toLowerCase() == "reset") color = "default"

    if (color.length > 6 && color != "default") {
        color = color.substr(0, 6)
    }

    setEmbedColor(message.author.id, color)

    return message.channel.send({
        embeds: [
            new CustomEmbed(
                message.member,
                false,
                `your color has been updated to **#${getEmbedColor(message.author.id)}**`
            ),
        ],
    })
}

cmd.setRun(run)

module.exports = cmd
