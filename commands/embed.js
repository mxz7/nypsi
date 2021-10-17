const { Message, Permissions } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("embed", "create an embed message", categories.UTILITY).setPermissions(["MANAGE_MESSAGES"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
        return
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

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

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("embed help")
            .addField("usage", `${prefix}embed <title> | (text) | (hex color)`)
            .addField(
                "help",
                "with this command you can create a simple embed message\n" + "**<>** required | **()** optional\n"
            )
            .addField(
                "examples",
                `${prefix}embed hello\n` +
                    `${prefix}embed hello | this is a description\n` +
                    `${prefix}embed hello | this is a description | #13c696`
            )

        return message.channel.send({ embeds: [embed] })
    }

    let mode = ""
    let color

    if (!message.content.includes("|")) {
        mode = "title_only"
    } else if (args.join(" ").split("|").length == 2) {
        mode = "title_desc"
    } else if (args.join(" ").split("|").length == 3) {
        mode = "title_desc_color"
    }

    cooldown.set(message.member.id, new Date())
    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    const title = args.join(" ").split("|")[0]
    let description

    if (mode.includes("desc")) {
        description = args.join(" ").split("|")[1]
    }

    if (mode.includes("color")) {
        color = args.join(" ").split("|")[2]
    }

    const embed = new CustomEmbed(message.member).setTitle(title)

    if (mode.includes("desc")) {
        embed.setDescription(description)
    }

    if (color) {
        embed.setColor(color)
    }

    message.channel
        .send({ embeds: [embed] })
        .then(() => {
            message.delete()
        })
        .catch((e) => {
            message.channel.send({ embeds: [new ErrorEmbed(e)] })
        })
}

cmd.setRun(run)

module.exports = cmd
