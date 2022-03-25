const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { startOpeningCrates, stopOpeningCrates } = require("../utils/commandhandler")
const { getInventory, getItems, openCrate, getDMsEnabled } = require("../utils/economy/utils")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")

const cmd = new Command("opencrates", "open all of your crates with one command", categories.MONEY)

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 30

    if (cooldown.has(message.member.id)) {
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (!isPremium(message.member)) {
        const embed = new CustomEmbed(
            message.member,
            false,
            "to open multiple crates a time you need the BRONZE tier or higher"
        ).setFooter(`${getPrefix(message.guild)}patreon`)

        return message.channel.send({ embeds: [embed] })
    }

    if (!getDMsEnabled(message.member)) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`you must have dms enabled. ${getPrefix(message.guild)}dms`)],
        })
    }

    const inventory = getInventory(message.member)
    const items = getItems()

    const crates = []

    let max = 10
    let hitMax = false

    if (getTier(message.member) >= 3) {
        max = 20
    }

    for (const item of Array.from(Object.keys(inventory))) {
        if (items[item].role == "crate") {
            while (crates.length < inventory[item]) {
                crates.push(item)
                if (crates.length >= max) {
                    hitMax = true
                    break
                }
            }
        }
    }

    if (crates.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you dont have any crates to open")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    startOpeningCrates(message.member)

    const embed = new CustomEmbed(message.member, false)

    embed.setTitle("opening crates")

    let desc = `opening ${crates.length} crates${hitMax ? " (limited)" : ""}`

    embed.setDescription(desc)

    desc += "\n\nyou found:\n"

    let fail = false

    const msg = await message.member.send({ embeds: [embed] }).catch(() => {
        fail = true
    })

    if (fail) {
        return message.channel.send({ embeds: [new ErrorEmbed("failed to dm you, please check your privacy settings")] })
    } else {
        await message.channel.send({ embeds: [new CustomEmbed(message.member, false, "✅ check your dms")] })
    }

    const interval = setInterval(() => {
        let finished = false
        const crate = crates.shift()

        const found = openCrate(message.member, items[crate])

        desc += ` - ${found.join("\n - ")}\n`

        if (crates.length == 0) {
            desc += "\n\nfinished (:"
            finished = true
        }

        embed.setDescription(desc)

        msg.edit({ embeds: [embed] })

        if (finished) {
            clearInterval(interval)
            stopOpeningCrates(message.member)
        }
    }, 1500)
}

cmd.setRun(run)

module.exports = cmd
