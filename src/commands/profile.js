const { Message } = require("discord.js")
const {
    userExists,
    createUser,
    getBalance,
    getBankBalance,
    getMaxBankBalance,
    getXp,
    getPrestige,
    calcMaxBet,
    getMulti,
    hasVoted,
    hasPadlock,
    getWorkers,
    getInventory,
} = require("../utils/economy/utils.js")
const { isPremium, getPremiumProfile } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { daysAgo, daysUntil } = require("../utils/utils")

const cooldown = new Map()

const cmd = new Command("profile", "view an overview of your profile and data", categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    if (!userExists(message.member)) {
        createUser(message.member)
    }

    const embed = new CustomEmbed(message.member, true)

    //ECONOMY
    const balance = getBalance(message.member).toLocaleString()
    const bankBalance = getBankBalance(message.member).toLocaleString()
    const maxBankBalance = getMaxBankBalance(message.member).toLocaleString()
    const xp = getXp(message.member).toLocaleString()
    const prestige = getPrestige(message.member).toLocaleString()
    const maxBet = await calcMaxBet(message.member)
    const multi = Math.floor((await getMulti(message.member)) * 100) + "%"
    const voted = hasVoted(message.member)
    const inventory = getInventory(message.member)
    let inventoryItems

    try {
        inventoryItems = Array.from(Object.values(inventory)).reduce((a, b) => a + b)
    } catch {
        inventoryItems = 0
    }

    embed.addField(
        "💰 economy",
        `**balance** $${balance}\n**bank** $${bankBalance} / $${maxBankBalance}\n**xp** ${xp}\n**prestige** ${prestige}
    **max bet** $${maxBet.toLocaleString()}\n**bonus** ${multi}\n**voted** ${voted}\n**padlock** ${hasPadlock(
            message.member
        )}
    **workers** ${Object.keys(getWorkers(message.member)).length}
    **inventory** ${inventoryItems.toLocaleString()} items`,
        true
    )

    //PATREON
    let tier, tierString, embedColor, lastDaily, lastWeekly, status, revokeReason, startDate, expireDate

    if (isPremium(message.author.id)) {
        const profile = getPremiumProfile(message.author.id)

        tier = profile.level
        tierString = profile.getLevelString()
        embedColor = profile.embedColor
        if (profile.lastDaily != "none") {
            lastDaily = daysAgo(profile.lastDaily) + " days ago"
        } else {
            lastDaily = profile.lastDaily
        }
        if (profile.lastWeekly != "none") {
            lastWeekly = daysAgo(profile.lastWeekly) + " days ago"
        } else {
            lastWeekly = profile.lastWeekly
        }
        status = profile.status
        revokeReason = profile.revokeReason
        startDate = daysAgo(profile.startDate) + " days ago"
        expireDate = daysUntil(profile.expireDate) + " days left"

        embed.addField(
            "💲 patreon",
            `**tier** ${tierString}\n**level** ${tier}\n**color** #${embedColor}\n**daily** ${lastDaily}
        **weekly** ${lastWeekly}\n**status** ${status}\n**reason** ${revokeReason}\n**start** ${startDate}\n**expire** ${expireDate}`,
            true
        )
    }

    embed.setTitle(message.author.tag)
    embed.setThumbnail(message.member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
