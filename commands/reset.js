const { Message, MessageActionRow, MessageButton } = require("discord.js")
const {
    getXp,
    getPrestigeRequirement,
    getBankBalance,
    getPrestigeRequirementBal,
    updateBankBalance,
    updateXp,
    getPrestige,
    setPrestige,
    userExists,
    createUser,
    getMulti,
    calcMaxBet,
    getInventory,
    setInventory,
    getBalance,
} = require("../utils/economy/utils.js")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const { addKarma } = require("../utils/karma/utils.js")

const cmd = new Command("reset", "reset your economy profile to gain karma", categories.MONEY)

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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (!userExists(message.member)) createUser(message.member)

    let earnedKarma = 0

    earnedKarma += (getPrestige(message.member) * 30)
    earnedKarma += (getXp(message.member) / 100)
    earnedKarma += ((getBalance(message.member) / 100000) / 2)

    earnedKarma = Math.floor(earnedKarma * 2.2)

    let embed = new CustomEmbed(
        message.member,
        true,
        "are you sure you want to reset your economy profile?\n\n" +
            `you will lose **everything**, but you will receive ${earnedKarma} karma`
    ).setTitle(`reset | ${message.member.user.username}`)

    cooldown.set(message.member.id, new Date())

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("✅").setLabel("do it.").setStyle("SUCCESS")
    )

    const msg = await message.channel.send({ embeds: [embed], components: [row] })

    const filter = (i) => i.user.id == message.author.id

    const reaction = await msg
        .awaitMessageComponent({ filter, time: 15000, errors: ["time"] })
        .then(async (collected) => {
            await collected.deferUpdate()
            return collected.customId
        })
        .catch(async () => {
            embed.setDescription("❌ expired")
            await msg.edit({ embeds: [embed], components: [] })
            cooldown.delete(message.author.id)
        })

    if (reaction == "✅") {
        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, 1800000)
        earnedKarma = 0

        earnedKarma += (getPrestige(message.member) * 30)
        earnedKarma += (getXp(message.member) / 100)
        earnedKarma += ((getBalance(message.member) / 100000) / 2)

        earnedKarma = Math.floor(earnedKarma * 2.2)

        addKarma(message.member, earnedKarma)

        embed.setDescription(
            `your economy profile has been reset.\n\nyou have been given **${earnedKarma}** karma`
        )

        await msg.edit({ embeds: [embed], components: [] })
    }
}

cmd.setRun(run)

module.exports = cmd
