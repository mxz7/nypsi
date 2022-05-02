const { workMessages } = require("../../data/lists.json")
const { getBalance, updateBalance, userExists, createUser } = require("../utils/economy/utils.js")
import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
const { isPremium, getTier } = require("../utils/premium/utils")

const cooldown = new Map()

const cmd = new Command("work", "work a random job and safely earn a random amount of money", Categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    let cooldownLength = 1800

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 900
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
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (!userExists(message.member)) createUser(message.member)

    if (getBalance(message.member) <= 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you need money to work")] })
    }

    if (getBalance(message.member) > 750000) {
        return message.channel.send({ embeds: [new ErrorEmbed("you're too rich for this command bro")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let earnedMax = 14

    if (getBalance(message.member) <= 100000) {
        earnedMax = 24
    } else if (getBalance(message.member) >= 250000) {
        earnedMax = 5
    }

    const earnedPercent = Math.floor(Math.random() * earnedMax) + 1
    let earned = Math.round((earnedPercent / 100) * getBalance(message.member))

    if (getBalance(message.member) >= 2000000) {
        const base = 25000
        const bonus = Math.floor(Math.random() * 75000)
        const total = base + bonus

        earned = total
    }

    const work = workMessages[Math.floor(Math.random() * workMessages.length)]

    updateBalance(message.member, getBalance(message.member) + earned)

    const embed = new CustomEmbed(message.member, true, work).setTitle("work | " + message.member.user.username)

    message.channel.send({ embeds: [embed] }).then((m) => {
        if (getBalance(message.member) >= 2000000) {
            embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "**")
        } else {
            embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "** (" + earnedPercent + "%)")
        }

        setTimeout(() => {
            m.edit({ embeds: [embed] })
        }, 1500)
    })
}

cmd.setRun(run)

module.exports = cmd
