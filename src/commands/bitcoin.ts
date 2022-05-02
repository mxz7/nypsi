import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { CustomEmbed } = require("../utils/models/EmbedBuilders")
const { getItems, getInventory, userExists, createUser } = require("../utils/economy/utils")

const cmd = new Command("bitcoin", "view the current bitcoin value (reflects real life USD)", Categories.MONEY).setAliases([
    "btc",
])

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!userExists(message.member)) createUser(message.member)
    const bitcoin = getItems()["bitcoin"]
    const inventory = getInventory(message.member)

    let bitcoinAmount = 0

    if (inventory["bitcoin"]) {
        bitcoinAmount = inventory["bitcoin"]
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `**worth** $${bitcoin.worth.toLocaleString()}\n**owned** ${bitcoinAmount.toLocaleString()} ($${(
            bitcoinAmount * bitcoin.worth
        ).toLocaleString()})`
    )
        .setFooter("not real bitcoin, although it reflects current worth in USD")
        .setTitle("bitcoin | " + message.author.username)

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
