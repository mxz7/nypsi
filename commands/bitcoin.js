const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getItems, getInventory } = require("../utils/economy/utils")

const cmd = new Command(
    "bitcoin",
    "view the current bitcoin value (reflects real life USD)",
    categories.MONEY
)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const bitcoin = getItems()["bitcoin"]
    const inventory = getInventory(message.member)

    let bitcoinAmount = 0

    if (inventory["bitcoin"]) {
        bitcoinAmount = inventory["bitcoin"]
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `**worth** $${bitcoin.worth.toLocaleString()}\n**owned** ${bitcoinAmount} ($${(
            bitcoinAmount * bitcoin.worth
        ).toLocaleString()})`
    ).setFooter("not real bitcoin, although it reflects current worth in USD")

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
