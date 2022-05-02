import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const { startOpeningCrates, stopOpeningCrates } = require("../utils/commandhandler")
const { getInventory, getItems, openCrate, getDMsEnabled } = require("../utils/economy/utils")
import { getPrefix } from "../utils/guilds/utils"
const { isPremium, getTier } = require("../utils/premium/utils")

const cmd = new Command("opencrates", "open all of your crates with one command", Categories.MONEY)

cmd.slashEnabled = true

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | NypsiCommandInteraction & CommandInteraction) {
    let cooldownLength = 30

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (!isPremium(message.member)) {
        const embed = new CustomEmbed(
            message.member,
            false,
            "to open multiple crates a time you need the BRONZE tier or higher"
        ).setFooter(`${getPrefix(message.guild)}patreon`)

        return send({ embeds: [embed] })
    }

    if (!getDMsEnabled(message.member)) {
        return send({
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
            let amount = 0
            while (amount < inventory[item]) {
                amount++
                crates.push(item)
                if (crates.length >= max) {
                    hitMax = true
                    break
                }
            }
        }
    }

    if (crates.length == 0) {
        return send({ embeds: [new ErrorEmbed("you dont have any crates to open")] })
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
        const reply = new ErrorEmbed("failed to dm you, please check your privacy settings")
        if (message.interaction) {
            return send({ embeds: [reply], ephemeral: true })
        } else {
            return send({ embeds: [reply] })
        }
    } else {
        const reply = new CustomEmbed(message.member, false, "✅ check your dms")
        if (message.interaction) {
            await send({ embeds: [reply], ephemeral: true })
        } else {
            await send({ embeds: [reply] })
        }
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
