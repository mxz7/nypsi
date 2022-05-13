import { CommandInteraction, Message } from "discord.js"
import { calcMaxBet, userExists, createUser } from "../utils/economy/utils.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed } from "../utils/models/EmbedBuilders"

const cmd = new Command("maxbet", "calculate your maximum bet", Categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (!userExists(message.member)) createUser(message.member)

    const maxBet = calcMaxBet(message.member)

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, false, `your maximum bet is $**${maxBet.toLocaleString()}**`)],
    })
}

cmd.setRun(run)

module.exports = cmd
