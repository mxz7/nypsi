import { CommandInteraction, Message, MessageActionRow, MessageButton } from "discord.js"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"

const cooldown = new Map()

const cmd = new Command("f", "pay your respects", Categories.FUN)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        cooldownLength = 15
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

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you need to pay respects to something")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let content = args.join(" ")

    if (content.split("\n").length > 2) {
        content = content.split("\n").join(".")
    }

    if (content.length > 50) {
        content = content.substr(0, 50)
    }

    const embed = new CustomEmbed(message.member, false, `press **F** to pay your respects to **${content}**`)

    const row = new MessageActionRow().addComponents(
        new MessageButton().setStyle("PRIMARY").setLabel("F").setCustomId("boobies")
    )

    await message.channel.send({ embeds: [embed], components: [row] })

    const reactions = []

    const collector = message.channel.createMessageComponentCollector({ time: 60000 })

    collector.on("collect", async (i) => {
        if (reactions.includes(i.user.id)) return

        i.deferUpdate()

        reactions.push(i.user.id)

        return await message.channel.send({
            embeds: [
                new CustomEmbed(message.member, false, `${i.user.toString()} has paid respects to **${args.join(" ")}**`),
            ],
        })
    })

    collector.on("end", async () => {
        await message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `**${reactions.length.toLocaleString()}** ${
                        reactions.length != 1 ? "people" : "person"
                    } paid their respects to **${content}**`
                ),
            ],
        })
    })
}

cmd.setRun(run)

module.exports = cmd
