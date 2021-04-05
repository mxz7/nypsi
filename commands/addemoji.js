const { Message } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command(
    "addemoji",
    "add an emoji from a different server to your server",
    categories.UTILITY
).setPermissions(["MANAGE_EMOJIS"]).setAliases(["stealemoji"])

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

        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    if (!message.guild.me.hasPermission("MANAGE_EMOJIS")) {
        return message.channel.send(
            new ErrorEmbed("i need the `manage emojis` permission for this command to work")
        )
    }

    if (!message.member.hasPermission("MANAGE_EMOJIS")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send(new ErrorEmbed("you need the `manage emojis` permission"))
        }
        return
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        return message.channel.send(
            new ErrorEmbed(`${prefix}addemoji <emoji>`).setTitle("`❌` usage")
        )
    }

    let emoji = args[0]

    emoji = emoji.split(":")

    if (!emoji[2]) {
        return message.channel.send(new ErrorEmbed("invalid emoji - please use a custom emoji"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 3000)

    const emojiID = emoji[2].slice(0, emoji[2].length - 1)
    const emojiName = emoji[1]

    let url = `https://cdn.discordapp.com/emojis/${emojiID}`

    if (emoji[0].includes("a")) {
        url = url + ".gif"
    } else {
        url = url + ".png"
    }

    let fail = false

    await message.guild.emojis.create(url, emojiName).catch(() => {
        return message.channel.send(
            new ErrorEmbed("error adding emoji - have you reached the emoji cap?")
        )
    })

    return message.channel.send(
        new CustomEmbed(message.member, false, `✅ emoji added as \`:${emojiName}:\``)
    )
}

cmd.setRun(run)

module.exports = cmd
