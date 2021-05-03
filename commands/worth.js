const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { userExists, createUser, getItems, formatBet, getMulti } = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("worth", "check the worth of items", categories.MONEY)

//DO THIS AND CRATE ALL COMMAND
//and error logs should look same as info logs

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed(`${getPrefix(message.guild)}worth <item>`))
    }

    const items = getItems()

    let searchTag = args[0].toLowerCase()

    let selected

    for (const itemName of Array.from(Object.keys(items))) {
        const aliases = items[itemName].aliases ? items[itemName].aliases : []
        if (searchTag == itemName) {
            selected = itemName
            break
        } else if (searchTag == itemName.split("_").join("")) {
            selected = itemName
            break
        } else if (aliases.indexOf(searchTag) != -1) {
            selected = itemName
            break
        }
    }

    selected = items[selected]

    if (!selected) {
        return message.channel.send(new ErrorEmbed(`couldnt find \`${args[0]}\``))
    }

    if (selected.role == "collectable") {
        return message.channel.send(
            new ErrorEmbed(
                "collectables can't be sold, although there are some incredibly rare collectables"
            )
        )
    }

    if (!selected.worth) {
        return message.channel.send(new ErrorEmbed("this item can not be bought or sold"))
    }

    let amount = 1

    if (args.length != 1) {
        if (isNaN(args[1]) || parseInt(args[1]) <= 0) {
            if (!isNaN(formatBet(args[1]) || !parseInt(formatBet[args[1]]))) {
                args[1] = formatBet(args[1])
            }
        }
        amount = parseInt(args[1])
    }

    if (!parseInt(amount)) {
        return message.channel.send(new ErrorEmbed("invalid amount"))
    }

    if (amount < 1) {
        return message.channel.send(new ErrorEmbed("invalid amount"))
    }

    if (amount > 250) amount = 250

    let worth = Math.floor(selected.worth * 0.5 * amount)

    const multi = await getMulti(message.member)

    if (selected.role == "fish" || selected.role == "prey") {
        worth = Math.floor(worth + worth * multi)
    } else if (selected.id == "dogecoin" || selected.id == "bitcoin") {
        worth = Math.floor(selected.worth * 0.9 * amount)
    }

    const embed = new CustomEmbed(message.member, false)

    embed.setDescription(
        `${amount} **${selected.name}** is worth $${worth.toLocaleString()} ${
            multi > 0 && (selected.role == "fish" || selected.role == "prey")
                ? `(+**${Math.floor(multi * 100).toString()}**% bonus)`
                : selected.id == "bitcoin" || selected.id == "dogecoin"
                ? "(-**10**% fee)"
                : ""
        }`
    )

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
