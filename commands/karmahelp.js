const { Message } = require("discord.js")
const { getMember } = require("../utils/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("karmahelp", "help about the karma system", categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const embed = new CustomEmbed(message.member, false).setTitle("karma help")

    embed.setDescription("karma is an xp-like system that rewards you for simply using nypsi. ")

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
