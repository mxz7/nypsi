import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed } from "../utils/models/EmbedBuilders"
import { calcMinimumEarnedXp, getRequiredBetForXp } from "../utils/economy/utils"

const cmd = new Command("minbet", "the minimum amount you need to bet to earn xp", Categories.MONEY)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const requiredBet = getRequiredBetForXp(message.member)

    let max = calcMinimumEarnedXp(message.member) + 2

    if (max > 7) {
        max = 7
    }

    const embed = new CustomEmbed(message.member, false)

    embed.setDescription(
        `you must bet atleast $**${requiredBet.toLocaleString()}** to earn xp\n\nthe most xp you can earn per win is **${max}**xp`
    )

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
