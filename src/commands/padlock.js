const { getPadlockPrice, userExists, createUser, hasPadlock } = require("../utils/economy/utils.js")
const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("padlock", "buy a padlock to protect your wallet", categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    const embed = new CustomEmbed(message.member).setTitle("padlock | " + message.member.user.username)

    const padlockPrice = getPadlockPrice()
    const prefix = getPrefix(message.guild)

    if (args.length == 1) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`this has been moved to ${prefix}**buy padlock**`)],
        })
    } else {
        if (hasPadlock(message.member)) {
            embed.setColor("#5efb8f")
            embed.setDescription("**protected** 🔒\nyou currently have a padlock")
            return await message.channel.send({ embeds: [embed] }).catch()
        } else {
            embed.setDescription(
                `**vulnerable** 🔓\nyou do not have a padlock\nyou can buy one for $**${padlockPrice.toLocaleString()}** with ${prefix}buy padlock`
            )
            embed.setColor("#e4334f")
            return await message.channel.send({ embeds: [embed] }).catch()
        }
    }
}

cmd.setRun(run)

module.exports = cmd
