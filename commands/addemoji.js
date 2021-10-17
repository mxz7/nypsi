const { Message, Permissions } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("addemoji", "add an emoji from a different server to your server", categories.UTILITY)
    .setPermissions(["MANAGE_EMOJIS"])
    .setAliases(["stealemoji"])

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 3 - diff

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

    if (!message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_EMOJIS_AND_STICKERS)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `manage emojis` permission for this command to work")],
        })
    }

    if (!message.member.permissions.has(Permissions.MANAGE_EMOJIS_AND_STICKERS)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage emojis` permission")] })
        }
        return
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0 && !message.attachments.first()) {
        return message.channel.send({
            embeds: [new ErrorEmbed(`${prefix}addemoji <emoji>`).setTitle("`❌` usage")],
        })
    }

    let mode = "arg"
    let url
    let name

    if (args.length == 0 || message.attachments.first()) {
        mode = "attachment"
    } else if (args[0]) {
        if (args[0].startsWith("http")) {
            mode = "url"
        } else {
            mode = "emoji"
        }
    }

    if (mode == "attachment") {
        url = message.attachments.first().attachment
        if (args.length != 0) {
            name = args[0]
        } else {
            name = message.attachments.first().name.split(".")[0]
        }
    } else if (mode == "emoji") {
        let emoji = args[0]

        emoji = emoji.split(":")

        if (!emoji[2]) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid emoji - please use a custom emoji")] })
        }

        const emojiID = emoji[2].slice(0, emoji[2].length - 1)

        if (args[1]) {
            name = args[1]
        } else {
            name = emoji[1]
        }

        url = `https://cdn.discordapp.com/emojis/${emojiID}`

        if (emoji[0].includes("a")) {
            url = url + ".gif"
        } else {
            url = url + ".png"
        }
    } else if (mode == "url") {
        url = args[0]
        if (args[1]) {
            name = args[1]
        } else {
            const a = url.split("/")
            name = a[a.length - 1]
            name = name.split(".")[0]
        }
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 3000)

    let fail = false

    await message.guild.emojis.create(url, name).catch((e) => {
        fail = true

        return message.channel.send({ embeds: [new ErrorEmbed(`discord error: \n\`\`\`${e.message}\`\`\``)] })
    })

    if (fail) return

    return message.channel.send({
        embeds: [new CustomEmbed(message.member, false, `✅ emoji added as \`:${name}:\``)],
    })
}

cmd.setRun(run)

module.exports = cmd
