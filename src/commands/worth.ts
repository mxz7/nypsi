import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const { userExists, createUser, getItems, formatBet, getMulti } = require("../utils/economy/utils")
import { getPrefix } from "../utils/guilds/utils"

const cmd = new Command("worth", "check the worth of items", Categories.MONEY)

//DO THIS AND CRATE ALL COMMAND
//and error logs should look same as info logs

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!userExists(message.member)) createUser(message.member)

    if (args.length == 0) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`${getPrefix(message.guild)}worth <item> (amount)\n\ncalculates the worth of an item`)],
        })
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
        return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] })
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
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] })
    }

    if (amount < 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid amount")] })
    }

    if (amount > 250) amount = 250

    let worth = Math.floor(selected.worth * 0.5 * amount)

    const multi = await getMulti(message.member)

    if (selected.role == "fish" || selected.role == "prey") {
        worth = Math.floor(worth + worth * multi)
    } else if (selected.id == "ethereum" || selected.id == "bitcoin") {
        if (!selected.worth) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`you cannot currently sell ${selected.name}`)],
            })
        }
        worth = Math.floor(selected.worth * 0.95 * amount)
    } else if (!selected.worth) {
        worth = 1000 * amount
    }

    const embed = new CustomEmbed(message.member, false)

    embed.setDescription(
        `${amount} ${selected.emoji} **${selected.name}** is worth $${worth.toLocaleString()} ${
            multi > 0 && (selected.role == "fish" || selected.role == "prey")
                ? `(+**${Math.floor(multi * 100).toString()}**% bonus)`
                : selected.id == "bitcoin" || selected.id == "ethereum"
                ? "(-**5**% fee)"
                : ""
        }`
    )

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
