import { getPadlockPrice, userExists, createUser, hasPadlock } from "../utils/economy/utils.js"
import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"

const cmd = new Command("padlock", "buy a padlock to protect your wallet", Categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!userExists(message.member)) createUser(message.member)

    const embed = new CustomEmbed(message.member).setHeader("padlock", message.author.avatarURL())

    const padlockPrice = getPadlockPrice()
    const prefix = getPrefix(message.guild)

    if (args.length == 1) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`this has been moved to ${prefix}**buy padlock**`)],
        })
    } else {
        if (hasPadlock(message.member)) {
            embed.setColor("#5efb8f")
            embed.setDescription("**protected** 🔒\nyou currently have a padlock")
            return await message.channel.send({ embeds: [embed] }).catch()
        } else {
            embed.setDescription(
                `**vulnerable** 🔓\nyou do not have a padlock\nyou can buy one for $**${padlockPrice.toLocaleString()}** with ${prefix}buy padlock`
            )
            embed.setColor("#e4334f")
            return await message.channel.send({ embeds: [embed] }).catch()
        }
    }
}

cmd.setRun(run)

module.exports = cmd
