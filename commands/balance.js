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
    deleteUser,
} = require("../utils/economy/utils.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")

const cmd = new Command("balance", "check your balance", categories.MONEY).setAliases(["bal", "money", "wallet"])

cmd.slashEnabled = true

cmd.slashData.addUserOption((option) =>
    option.setName("user").setDescription("view balance of this user").setRequired(false)
)

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
            if (!userExists(target)) createUser(target)
            id = true
        }

        if (args[1] == "reset") {
            deleteUser(target)
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
        .setHeader(`${target.user.tag} | season 3`)
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

    const send = async (data) => {
        if (message.interaction) {
            return await message.reply(data)
        } else {
            return await message.channel.send(data)
        }
    }

    if (message.member == target) {
        if (
            getXp(target) >= getPrestigeRequirement(target) &&
            getBankBalance(target) >= getPrestigeRequirementBal(getXp(target)) &&
            getPrestige(target) < 20
        ) {
            return send({
                content: `you are eligible to prestige, use ${getPrefix(message.guild)}prestige for more info`,
                embeds: [embed],
            })
        }
    }

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
