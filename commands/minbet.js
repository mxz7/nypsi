const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getPrestige } = require("../utils/economy/utils")

const cmd = new Command("minbet", "the minimum amount you need to bet to earn xp", categories.MONEY)

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
    let requiredBet = 1000

    if (getPrestige(message.member) > 2) requiredBet = 10000

    requiredBet += getPrestige(message.member) * 5000

    let max = 2 + getPrestige(message.member) == 0 ? 1 : getPrestige(message.member)

    if (max > 5) {
        max = 5
    }

    const embed = new CustomEmbed(message.member, false)

    embed.setDescription(`you must bet atleast $**${requiredBet.toLocaleString()}** to earn xp\n\nthe most xp you can earn per win is **${max}**xp`)

    return message.channel.send({embeds: [embed]})
}

cmd.setRun(run)

module.exports = cmd