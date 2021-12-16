const { Message } = require("discord.js")
const { getMember } = require("../utils/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getKarma } = require("../utils/karma/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("karma", "check how much karma you have", categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let target = message.member

    if (args.length >= 1) {
        target = message.mentions.members.first()

        if (!target) {
            target = await getMember(message, args.join(" "))
        }

        if (!target) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
        }
    }

    const karma = getKarma(target)

    const embed = new CustomEmbed(message.member, false)

    if (target.user.id == message.author.id) {
        embed.setTitle("your karma")
    } else {
        embed.setTitle(`${target.user.username}'s karma`)
    }

    embed.setDescription(`you have **${karma.toLocaleString()}** karma`)

    embed.setFooter(`whats karma? do ${getPrefix(message.guild)}karmahelp`)

    return message.channel.send({embeds: [embed]})
}

cmd.setRun(run)

module.exports = cmd
