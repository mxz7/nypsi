const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getItems, getInventory, userExists, createUser } = require("../utils/economy/utils")

const cmd = new Command("ethereum", "view the current ethereum value (reflects real life USD)", categories.MONEY).setAliases(
    ["eth"]
)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    if (!userExists(message.member)) createUser(message.member)
    const ethereum = getItems()["ethereum"]
    const inventory = getInventory(message.member)

    let ethereumAmount = 0

    if (inventory["ethereum"]) {
        ethereumAmount = inventory["ethereum"]
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `**worth** $${ethereum.worth.toLocaleString()}\n**owned** ${ethereumAmount.toLocaleString()} ($${(
            ethereumAmount * ethereum.worth
        ).toLocaleString()})`
    )
        .setFooter("not real ethereum, although it reflects current worth in USD")
        .setTitle("ethereum | " + message.author.username)

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
