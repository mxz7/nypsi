const { Message } = require("discord.js")
const { getPrefix } = require("../guilds/utils")
const { isPremium, getTier, getEmbedColor, setEmbedColor } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("setcolor", "set the color of the bot's messages (premium only)", categories.INFO).setAliases(["setcolour"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!isPremium(message.author.id)) {
        return message.channel.send(new ErrorEmbed("you must be a SILVER tier patreon for this command\n\nhttps://www.patreon.com/nypsi"))
    }

    if (getTier(message.author.id) < 2) {
        return message.channel.send(new ErrorEmbed("you must be atleast SILVER tier for this command, you are BRONZE\n\nhttps://www.patreon.com/nypsi"))
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)

        embed.setDescription(`**color** #${getEmbedColor(message.author.id)}\n\nuse \`${getPrefix(message.guild)}setcolor <hex color code>\` to change this
        you can use ${getPrefix(message.guild)}color to find a color, or an online color picker tool`)

        return message.channel.send(embed)
    }

    let color = args[0].split("#").join("")

    if (color.toLowerCase() == "reset") color = "default"

    if (color.length > 6 && color != "default") {
        color = color.substr(0, 6)
    }

    setEmbedColor(message.author.id, color)

    return message.channel.send(new CustomEmbed(message.member, false, `your color has been updated to **#${getEmbedColor(message.author.id)}**`))
}

cmd.setRun(run)

module.exports = cmd