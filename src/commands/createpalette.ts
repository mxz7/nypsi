import { CommandInteraction, Message, Permissions } from "discord.js"
import { getPrefix } from "../utils/guilds/utils"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
import { inPlaceSort } from "fast-sort"

const cmd = new Command(
    "createpalette",
    "create a color palette for color.tekoh.net from role colors",
    Categories.UTILITY
).setAliases(["palette", "rolepalette"])

const cooldown = new Map()

const regex = /[^a-f0-9]/g

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 15 - diff

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

    if (!isPremium(message.author.id)) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must be a patreon for this command")] })
    }

    if (!message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `manage roles` permission for this command to work")],
        })
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(
            message.member,
            false,
            "create a color palette from the roles in the server, uses https://color.tekoh.net"
        )

        embed.setTitle("create palette")
        embed.addField(
            "usage",
            `${getPrefix(
                message.guild
            )}palette <name> <background color>\nuse _ (underscores) for spaces in name, you can use ${getPrefix(
                message.guild
            )}color to find a color, or an [online color picker tool](https://color.tekoh.net)`
        )
        embed.addField("example", `${getPrefix(message.guild)}palette my_palette #ff0000`)
        return message.channel.send({ embeds: [embed] })
    }

    const roles = await message.guild.roles.fetch()

    const sortedRoleIDs = []

    roles.forEach((r) => sortedRoleIDs.push(r.id))

    inPlaceSort(sortedRoleIDs).desc((i) => roles.find((r) => r.id == i).position)

    const colors = []

    for (let i = 0; i < sortedRoleIDs.length; i++) {
        if (colors.length >= 100) break
        const role = roles.find((r) => r.id == sortedRoleIDs[i])

        if (role.hexColor != "#000000") {
            if (colors.indexOf(role.hexColor.substr(1, 7)) != -1) continue
            colors.push(role.hexColor.substr(1, 7))
        }
    }

    if (colors.length < 3) {
        return message.channel.send({
            embeds: [new ErrorEmbed("there aren't enough role colors to make a palette (minimum of 3)")],
        })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 15 * 1000)

    // http://127.0.0.1:5500/#!ff0000!00ff00!0000ff&?test&?6c8ab9

    let url = "https://color.tekoh.net/#!"

    url += colors.join("!")

    url += `&?${args[0]}`

    let color = args[1]

    if (!color) {
        color = "dbdbdb"
    } else {
        if (color.startsWith("#")) {
            color = color.substr(1, color.length)
        }

        if (color.length != 6) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        `invalid color, you can use ${getPrefix(
                            message.guild
                        )}color to find a color, or an [online color picker tool](https://color.tekoh.net)`
                    ),
                ],
            })
        }

        if (color.match(regex)) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        `invalid color, you can use ${getPrefix(
                            message.guild
                        )}color to find a color, or an [online color picker tool](https://color.tekoh.net)`
                    ),
                ],
            })
        }
    }

    url += `&?${color}`

    const embed = new CustomEmbed(message.member, true).setTitle("palette").setURL(url)

    if (url.length < 500) {
        embed.setDescription(url)
    } else {
        embed.setDescription(`very long URL generated ~ ${colors.length} colors`)
    }

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
