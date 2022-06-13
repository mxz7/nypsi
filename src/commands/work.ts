// @ts-expect-error doesnt like getting from json file
import { workMessages } from "../../data/lists.json"
import { getBalance, updateBalance, userExists, createUser } from "../utils/economy/utils.js"
import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"

const cmd = new Command("work", "work a random job and safely earn a random amount of money", Categories.MONEY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    if (!(await userExists(message.member))) createUser(message.member)

    if (getBalance(message.member) <= 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you need money to work")] })
    }

    if (getBalance(message.member) > 1000000) {
        return message.channel.send({ embeds: [new ErrorEmbed("you're too rich for this command bro")] })
    }

    await addCooldown(cmd.name, message.member, 1800)

    let earnedMax = 20

    if (getBalance(message.member) <= 100000) {
        earnedMax = 35
    } else if (getBalance(message.member) >= 250000) {
        earnedMax = 10
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

    const embed = new CustomEmbed(message.member, true, work).setHeader("work", message.author.avatarURL())

    message.channel.send({ embeds: [embed] }).then((m) => {
        if (getBalance(message.member) >= 2000000) {
            embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "**")
        } else {
            embed.setDescription(work + "\n\n+$**" + earned.toLocaleString() + "**")
        }

        setTimeout(() => {
            m.edit({ embeds: [embed] })
        }, 1500)
    })
}

cmd.setRun(run)

module.exports = cmd
