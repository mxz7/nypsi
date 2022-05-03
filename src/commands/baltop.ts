import { topAmount } from "../utils/economy/utils.js"
import { CommandInteraction, Message, Permissions } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"

const cooldown = new Map()

const cmd = new Command("baltop", "view top balances in the server", Categories.MONEY).setAliases(["top", "gangsters"])

cmd.slashEnabled = true

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const send = async (data) => {
        if (!(message instanceof Message)) {
            return await message.editReply(data)
        } else {
            return await message.channel.send(data)
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 10 - diff

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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    let amount

    if (args.length == 0) {
        args[0] = "5"
    }

    if (isNaN(parseInt(args[0])) || parseInt(args[0]) <= 0) {
        args[0] = "5"
    }

    amount = parseInt(args[0])

    if (amount > 10 && !message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) amount = 10

    if (amount < 5) amount = 5

    if (!(message instanceof Message)) {
        await message.deferReply()
    }

    const balTop = await topAmount(message.guild, amount)

    const filtered = balTop.filter(function (el) {
        return el != null
    })

    const embed = new CustomEmbed(message.member, false)
        .setTitle("top " + filtered.length)
        .setDescription(filtered.join("\n"))

    send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
