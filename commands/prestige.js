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
} = require("../utils/economy/utils.js")
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (!userExists(message.member)) createUser(message.member)

    if (getPrestige(message.member) >= 20) {
        return message.channel.send({
            embeds: [
                new ErrorEmbed("gg, you're max prestige. you completed nypsi").setImage("https://i.imgur.com/vB3UGgi.png"),
            ],
        })
    }

    let currentXp = getXp(message.member),
        neededXp = getPrestigeRequirement(message.member)
    let currentBal = getBankBalance(message.member),
        neededBal = getPrestigeRequirementBal(neededXp)

    if (currentXp < neededXp) {
        return message.channel.send({ embeds: [new ErrorEmbed(`you need **${neededXp.toLocaleString()}**xp to prestige`)] })
    }

    if (currentBal < neededBal) {
        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`
                ).setTitle(`prestige | ${message.member.user.username}`),
            ],
        })
    }

    let embed = new CustomEmbed(
        message.member,
        true,
        "are you sure you want to prestige?\n\n" +
            `you will lose **${neededXp.toLocaleString()}**xp and $**${neededBal.toLocaleString()}**\n\n`
    ).setTitle(`prestige | ${message.member.user.username}`)

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
        currentXp = getXp(message.member)
        neededXp = getPrestigeRequirement(message.member)
        currentBal = getBankBalance(message.member)
        neededBal = getPrestigeRequirementBal(neededXp)

        if (currentXp < neededXp) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`you need **${neededXp.toLocaleString()}**xp to prestige`)],
            })
        }

        if (currentBal < neededBal) {
            return message.channel.send({
                embeds: [
                    new CustomEmbed(
                        message.member,
                        false,
                        `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`
                    ).setTitle(`prestige | ${message.member.user.username}`),
                ],
            })
        }

        updateBankBalance(message.member, currentBal - neededBal)
        updateXp(message.member, currentXp - neededXp)
        setPrestige(message.member, getPrestige(message.member) + 1)

        const multi = await getMulti(message.member)
        const maxBet = await calcMaxBet(message.member)

        const inventory = getInventory(message.member)

        let amount = 1

        if (getPrestige(message.member) > 5) {
            amount = 2
        } else if (getPrestige(message.member) > 10) {
            amount = 3
        }

        if (inventory["basic_crate"]) {
            inventory["basic_crate"] += amount
        } else {
            inventory["basic_crate"] = amount
        }

        setInventory(message.member, inventory)

        embed.setDescription(
            `you are now prestige **${getPrestige(message.member)}**\n\n` +
                `new vote rewards: $**${(15000 * (getPrestige(message.member) + 1)).toLocaleString()}**, **${
                    getPrestige(message.member) + 1
                }** vote crates\n` +
                `your new multiplier: **${Math.floor(multi * 100)}**%\nyour maximum bet: $**${maxBet.toLocaleString()}**\n` +
                `you have also received **${amount}** basic crate${amount > 1 ? "s" : ""}`
        )

        await msg.edit({ embeds: [embed], components: [] })
    }
}

cmd.setRun(run)

module.exports = cmd
