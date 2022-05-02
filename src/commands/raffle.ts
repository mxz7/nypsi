import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"

const cooldown = new Map()

const cmd = new Command("raffle", "select a random user all server members or from a specific role", Categories.FUN)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 3 - diff

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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 3000)

    let members = []

    if (args.length == 0) {
        const members1 = message.guild.members.cache

        members1.forEach((m) => {
            if (!m.user.bot) {
                if (members.indexOf(m.user.id) == -1) {
                    members.push(m.user.id)
                }
            }
        })
    } else {
        const role = message.guild.roles.cache.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()))

        if (!role) {
            return await message.channel.send({ embeds: [new ErrorEmbed("i wasn't able to find that role")] })
        }

        role.members.forEach((m) => {
            members.push(m.user.id)
        })

        if (members.length == 0) {
            return message.channel.send({ embeds: [new ErrorEmbed("there is nobody in that role")] })
        }
    }

    let chosen = members[Math.floor(Math.random() * members.length)]

    chosen = await message.guild.members.fetch(chosen)

    const embed = new CustomEmbed(message.member)
        .setTitle(`${message.member.user.username}'s raffle`)
        .setDescription(`${chosen.user.toString()} | \`${chosen.user.tag}\``)

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
