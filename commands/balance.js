const { Message } = require("discord.js")
const { getMember } = require("../utils/utils")
const {
    getBalance,
    createUser,
    userExists,
    updateBalance,
    getBankBalance,
    getMaxBankBalance,
    getXp,
    getPrestigeRequirement,
    getPrestigeRequirementBal,
    getPrestige,
    createStatsProfile,
} = require("../utils/economy/utils.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("balance", "check your balance", categories.MONEY).setAliases(["bal", "money", "wallet"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id == "672793821850894347" && args.length == 2) {
        let target = message.mentions.members.first()
        let id = false

        if (!target) {
            target = args[0]
            if (!userExists(target)) {
                return message.channel.send({
                    content: "❌ invalid user - you must tag the user for this command or use a user id",
                })
            }
            id = true
        }

        if (args[1] == "reset") {
            createUser(target)
            createStatsProfile(target)
            return message.react("✅")
        }

        const amount = parseInt(args[1])

        updateBalance(target, amount)

        return message.react("✅")
    }

    let target = message.member

    if (args.length >= 1) {
        target = message.mentions.members.first()

        if (!target) {
            target = await getMember(message, args.join(" "))
        }

        if (!target) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
        }
    }

    if (!userExists(target)) createUser(target)

    let footer = `xp: ${getXp(target).toLocaleString()}`

    if (getPrestige(target) > 0) {
        footer += ` | prestige: ${getPrestige(target)}`
    }

    const embed = new CustomEmbed(message.member, false)
        .setHeader(`${target.user.tag} | season 2`)
        .setDescription(
            "💰 $**" +
                getBalance(target).toLocaleString() +
                "**\n" +
                "💳 $**" +
                getBankBalance(target).toLocaleString() +
                "** / $**" +
                getMaxBankBalance(target).toLocaleString() +
                "**"
        )
        .setFooter(footer)

    if (message.member == target) {
        if (
            getXp(target) >= getPrestigeRequirement(target) &&
            getBankBalance(target) >= getPrestigeRequirementBal(getXp(target)) &&
            getPrestige(target) < 20
        ) {
            return message.channel.send({
                content: `you are eligible to prestige, use ${getPrefix(message.guild)}prestige for more info`,
                embeds: [embed],
            })
        }
    }

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
