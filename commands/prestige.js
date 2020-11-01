const { Message } = require("discord.js")
const { getXp, getPrestigeRequirement, getBankBalance, getPrestigeRequirementBal, updateBankBalance, updateXp, getPrestige, setPrestige, userExists, createUser, getMulti, calcMaxBet } = require("../economy/utils")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("prestige", "prestige to gain extra benefits", categories.MONEY)

const cooldown = new Map()

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 1800 - diff

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

    if (!userExists(message.member)) createUser(message.member)

    let currentXp = getXp(message.member), neededXp = getPrestigeRequirement(message.member)
    let currentBal = getBankBalance(message.member), neededBal = getPrestigeRequirementBal(neededXp)

    if (currentXp < neededXp) {
        return message.channel.send(new ErrorEmbed(`you need **${neededXp.toLocaleString()}**xp to prestige`))
    }

    if (currentBal < neededBal) {
        return message.channel.send(new CustomEmbed(message.member, false, `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`).setTitle(`prestige | ${message.member.user.username}`))
    }

    let embed = new CustomEmbed(message.member, true, "are you sure you want to prestige?\n\n" + `you will lose **${neededXp.toLocaleString()}**xp and $**${neededBal.toLocaleString()}**\n\n` +
        "react with ✅ to prestige").setTitle(`prestige | ${message.member.user.username}`)

    cooldown.set(message.member.id, new Date())

    const msg = await message.channel.send(embed)
    await msg.react("✅")

    const filter = (reaction, user) => {
        return ["✅"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    const reaction = await msg.awaitReactions(filter, { max: 1, time: 15000, errors: ["time"] })
        .then(collected => {
            return collected.first().emoji.name
        }).catch(async () => {
            await msg.reactions.removeAll()
            embed.setDescription("❌ expired")
            await msg.edit(embed)
            cooldown.delete(message.author.id)
        })

    if (reaction == "✅") {
        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, 1800000)
        currentXp = getXp(message.member)
        neededXp = getPrestigeRequirement(message.member)
        currentBal = getBankBalance(message.member)
        neededBal = getPrestigeRequirementBal(neededXp)

        if (currentXp < neededXp) {
            return message.channel.send(new ErrorEmbed(`you need **${neededXp.toLocaleString()}**xp to prestige`))
        }
    
        if (currentBal < neededBal) {
            return message.channel.send(new CustomEmbed(message.member, false, `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`).setTitle(`prestige | ${message.member.user.username}`))
        }

        updateBankBalance(message.member, currentBal - neededBal)
        updateXp(message.member, currentXp - neededXp)
        setPrestige(message.member, getPrestige(message.member) + 1)

        const multi = await getMulti(message.member)
        const maxBet = await calcMaxBet(message.member)

        embed.setDescription(`you are now prestige **${getPrestige(message.member)}**\n\n` + 
            `new vote rewards: $**${(15000 * (getPrestige(message.member) + 1)).toLocaleString()}**\n` +
            `your new multiplier: **${multi}**%\nyour maximum bet: $**${maxBet.toLocaleString()}**`)
        await msg.edit(embed)
    }

    
}

cmd.setRun(run)

module.exports = cmd