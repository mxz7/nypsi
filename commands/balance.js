const { Message } = require("discord.js")
const { getMember } = require("../utils/utils")
const { getBalance, createUser, userExists, updateBalance, getBankBalance, getMaxBankBalance, getXp, userExistsID, updateBalanceID, createUserID } = require("../economy/utils.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("balance", "check your balance", categories.MONEY).setAliases(["bal", "money"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (message.member.user.id == "672793821850894347" && args.length == 2) {
        let target = message.mentions.members.first();
        let id = false

        if (!target) {
            target = args[0]
            if (!userExistsID(target)) {
                return message.channel.send("❌ invalid user - you must tag the user for this command or use a user id");
            }
            id = true
        }

        if (args[1] == "reset") {
            if (id) {
                createUserID(target)
                return message.react("✅")
            } else {
                createUser(target)
                return message.react("✅")
            }
        }

        const amount = parseInt(args[1])

        if (id) {
            updateBalanceID(target, amount)
        } else {
            updateBalance(target, amount)
        }


        return message.react("✅")
    }

    let target = message.member

    if (args.length >= 1) { 
        target = message.mentions.members.first();

        if (!target) {
            target = getMember(message, args[0])
        }

        if (!target) {
            return message.channel.send(new ErrorEmbed("invalid user"))
        }
    }

    if (!userExists(target)) createUser(target)

    const embed = new CustomEmbed(message.member, false)
        .setTitle(target.user.tag)
        .setDescription("💰 $**" + getBalance(target).toLocaleString() + "**\n" +
            "💳 $**" + getBankBalance(target).toLocaleString() + "** / $**" + getMaxBankBalance(target).toLocaleString() + "**")
        .setFooter("xp: " + getXp(target).toLocaleString())

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd