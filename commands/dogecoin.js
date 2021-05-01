const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getItems, getInventory } = require("../utils/economy/utils")

const cmd = new Command(
    "dogecoin",
    "view the current dogecoin value (reflects real life USD x 100)",
    categories.MONEY
)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    const dogecoin = getItems()["dogecoin"]
    const inventory = getInventory(message.member)

    let dogecoinAmount = 0

    if (inventory["dogecoin"]) {
        dogecoinAmount = inventory["dogecoin"]
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `**worth** $${dogecoin.worth.toLocaleString()}\n**owned** ${dogecoinAmount} ($${(
            dogecoinAmount * dogecoin.worth
        ).toLocaleString()})`
    ).setFooter("not real dogecoin, although it reflects current worth in USD x 100")

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
