import { Message } from "discord.js"
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
import { Command, Categories } from "../utils/models/Command"
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("ezpoll", "simple poll builder", Categories.UTILITY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message, args: string[]) {
    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 5
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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("ezpoll help")
            .addField("usage", `${prefix}ezpoll <choices..>`)
            .addField(
                "help",
                "after creation your message will be deleted and an embed will be created to act as the poll\n" +
                    "every word will be an option in the poll, with a maximum of 4 and minimum of two - use _ to have a space"
            )
            .addField("example", `${prefix}ezpoll option1 option2`)

        return message.channel.send({ embeds: [embed] })
    }

    if (args.length < 2) {
        return message.channel.send({ embeds: [new ErrorEmbed("not enough options")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let choices = ""
    let count = 1

    for (let option of args) {
        if (count > 4) break

        option = option.split("_").join(" ")

        if (count == 1) {
            choices = "1️⃣ " + option
        } else if (count == 2) {
            choices = choices + "\n2️⃣ " + option
        } else if (count == 3) {
            choices = choices + "\n3️⃣ " + option
        } else if (count == 4) {
            choices = choices + "\n4️⃣ " + option
        }

        count++
    }

    const embed = new CustomEmbed(message.member, false, choices)
        .setTitle("poll by " + message.member.user.username)
        .setFooter("use $ezpoll to make a quick poll")
        .setDescription(choices)

    message.channel.send({ embeds: [embed] }).then(async (m) => {
        await message.delete().catch()

        if (args.length >= 2) {
            await m.react("1️⃣")
            await m.react("2️⃣")
        }

        if (args.length >= 3) await m.react("3️⃣")
        if (args.length >= 4) await m.react("4️⃣")
    })
}

cmd.setRun(run)

module.exports = cmd
