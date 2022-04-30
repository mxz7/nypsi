const { Message, Permissions } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/models/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("poll", "create a poll with a lot of customisation", categories.UTILITY)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 5
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = cooldownLength - diff

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
            .setTitle("poll help")
            .addField("usage", `${prefix}poll (choices) <title> | (text) | (hex color)`)
            .addField(
                "help",
                "**<>** required | **()** optional\n" +
                    "after creation your message will be deleted and an embed will be created with your text and color if given\n" +
                    "if a number isnt found for choices then 👍👎 emojis will be used\n" +
                    "largest number of choices is 10, and 1 is minimum"
            )
            .addField(
                "examples",
                `${prefix}poll question?\n` +
                    `${prefix}poll 2 title | this is a description\n` +
                    `${prefix}poll 9 hello | this is a description | #13c696`
            )

        return message.channel.send({ embeds: [embed] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let choices = 0

    if (parseInt(args[0])) {
        const num = parseInt(args[0])

        if (num < 2) {
            choices = 0
        } else if (num > 10) {
            choices = 10
        } else {
            choices = num
        }

        if (
            !message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES) &&
            !message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR) &&
            num > 2
        ) {
            choices = 2
        }
        args.shift()
    }

    let mode = ""

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("missing text")] })
    }

    if (!message.content.includes("|")) {
        mode = "title_only"
    } else if (args.join(" ").split("|").length == 2) {
        mode = "title_desc"
    } else if (args.join(" ").split("|").length == 3) {
        mode = "title_desc_color"
    }

    const title = args.join(" ").split("|")[0]
    let description, color

    if (mode.includes("desc")) {
        description = args.join(" ").split("|")[1]
    }

    if (mode.includes("color")) {
        color = args.join(" ").split("|")[2]
    }

    const embed = new CustomEmbed(message.member).setTitle(title)

    if (color) embed.setColor(color)

    if (mode.includes("desc")) {
        embed.setDescription(description)
    }

    if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        embed.setHeader(message.member.user.tag)
    }

    message.channel.send({ embeds: [embed] }).then(async (m) => {
        await message.delete().catch()

        if (choices == 0) {
            await m.react("👍")
            await m.react("👎")
        } else if (choices >= 2) {
            await m.react("1️⃣")
            await m.react("2️⃣")
        }

        if (choices >= 3) await m.react("3️⃣")
        if (choices >= 4) await m.react("4️⃣")
        if (choices >= 5) await m.react("5️⃣")
        if (choices >= 6) await m.react("6️⃣")
        if (choices >= 7) await m.react("7️⃣")
        if (choices >= 8) await m.react("8️⃣")
        if (choices >= 9) await m.react("9️⃣")
        if (choices == 10) await m.react("🔟")
    })
}

cmd.setRun(run)

module.exports = cmd
