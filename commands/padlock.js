const {
    hasPadlock,
    setPadlock,
    getBalance,
    updateBalance,
    createUser,
    userExists,
    getPadlockPrice,
} = require("../utils/economy/utils.js")
const { getColor } = require("../utils/utils")
const { MessageEmbed, Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cooldown = new Map()

const cmd = new Command("padlock", "buy a padlock to protect your wallet", categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!userExists(message.member)) createUser(message.member)

    const embed = new CustomEmbed(message.member).setTitle(
        "padlock | " + message.member.user.username
    )

    const padlockPrice = getPadlockPrice()
    const prefix = getPrefix(message.guild)

    if (args.length == 1 && args[0].toLowerCase() == "buy") {
        if (hasPadlock(message.member)) {
            embed.setColor("#5efb8f")
            embed.setDescription("**protected** 🔒\nyou currently have a padlock")
            return await message.channel.send(embed)
        }

        if (getBalance(message.member) < padlockPrice) {
            return await message.channel.send(
                new ErrorEmbed("you cannot currently afford a padlock")
            )
        }

        let cooldownLength = 30

        if (isPremium(message.author.id)) {
            if (getTier(message.author.id) == 4) {
                cooldownLength = 10
            }
        }

        if (cooldown.has(message.member.user.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = cooldownLength - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
        }

        cooldown.set(message.member.user.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        updateBalance(message.member, getBalance(message.member) - padlockPrice)
        setPadlock(message.member, true)
        return await message.channel.send(
            new CustomEmbed(
                message.member,
                false,
                "✅ you have successfully bought a padlock for $**" +
                    padlockPrice.toLocaleString() +
                    "**"
            )
        )
    } else {
        if (hasPadlock(message.member)) {
            embed.setColor("#5efb8f")
            embed.setDescription("**protected** 🔒\nyou currently have a padlock")
            return await message.channel.send(embed).catch()
        } else {
            embed.setDescription(
                `**vulnerable** 🔓\nyou do not have a padlock\nyou can buy one for $**${padlockPrice.toLocaleString()}** with ${prefix}padlock buy`
            )
            embed.setColor("#e4334f")
            return await message.channel.send(embed).catch()
        }
    }
}

cmd.setRun(run)

module.exports = cmd
