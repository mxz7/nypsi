import { CommandInteraction, Message } from "discord.js"
import {
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
} from "../utils/economy/utils.js"
import { isPremium, getPremiumProfile } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed } from "../utils/models/EmbedBuilders"
import { daysAgo, daysUntil } from "../utils/functions/date.js"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js"

const cmd = new Command("profile", "view an overview of your profile and data", Categories.INFO)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    await addCooldown(cmd.name, message.member, 10)

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
        inventoryItems = Array.from(Object.values(inventory)).reduce((a: any, b: any) => a + b)
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
        if (profile.lastDaily != 0) {
            lastDaily = daysAgo(profile.lastDaily) + " days ago"
        } else {
            lastDaily = profile.lastDaily
        }
        if (profile.lastWeekly != 0) {
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

    embed.setHeader(message.author.tag)
    embed.setThumbnail(message.member.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
