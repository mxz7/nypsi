const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { isPremium } = require("../utils/premium/utils")
const {
    usernameProfileExists,
    createUsernameProfile,
    fetchUsernameHistory,
    clearUsernameHistory,
    isTracking,
} = require("../utils/users/utils")
const { getMember, formatDate } = require("../utils/utils")

const cmd = new Command(
    "usernamehistory",
    "view a user's username history",
    categories.INFO
).setAliases(["un", "usernames"])

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 15

    if (isPremium(message.author.id)) {
        cooldownLength = 5
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

    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (args[0].toLowerCase() == "-clear") {
            clearUsernameHistory(message.member)
            return message.channel.send({
                embeds: [new CustomEmbed(message.member, false, "✅ your username history has been cleared")]
            })
        }

        if (!message.mentions.members.first()) {
            member = await getMember(message, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")]})
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (!usernameProfileExists(member)) createUsernameProfile(member)

    const isUserTracking = isTracking(member)

    const history = fetchUsernameHistory(member)

    /**
     * @type {Map<Number, Array<{ value: String, date: Number }>}
     */
    const pages = new Map()

    for (const item of history) {
        if (pages.size == 0) {
            if (!isUserTracking) {
                pages.set(1, [{ value: "[tracking disabled]", date: Date.now() }, item])
            } else {
                pages.set(1, [item])
            }
        } else {
            if (pages.get(pages.size).length >= 7) {
                pages.set(pages.size + 1, [item])
            } else {
                const current = pages.get(pages.size)
                current.push(item)
                pages.set(pages.size, current)
            }
        }
    }

    const embed = new CustomEmbed(message.member, true)
        .setTitle(member.user.tag)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))

    let description = ""

    for (const item of pages.get(1)) {
        description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`
    }

    embed.setDescription(description)

    if (pages.size > 1) {
        embed.setFooter(`page 1/${pages.size}`)
    }

    const msg = await message.channel.send({ embeds: [embed] })

    if (pages.size == 1) return

    await msg.react("⬅")
    await msg.react("➡")

    let currentPage = 1
    const lastPage = pages.size

    const filter = (reaction, user) => {
        return ["⬅", "➡"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    const pageManager = async () => {
        const reaction = await msg
            .awaitReactions({ filter, max: 1, time: 30000, errors: ["time"] })
            .then((collected) => {
                return collected.first().emoji.name
            })
            .catch(async () => {
                await msg.reactions.removeAll()
            })

        if (!reaction) return

        const newEmbed = new CustomEmbed(message.member, false)
            .setTitle(member.user.tag)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--

                let description = ""

                for (const item of pages.get(currentPage)) {
                    description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`
                }

                newEmbed.setDescription(description)

                newEmbed.setFooter(`page ${currentPage}/${lastPage}`)
                await msg.edit({embeds: [newEmbed]})
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage >= lastPage) {
                return pageManager()
            } else {
                currentPage++

                let description = ""

                for (const item of pages.get(currentPage)) {
                    description += `\`${item.value}\` | \`${formatDate(item.date)}\`\n`
                }

                newEmbed.setDescription(description)

                newEmbed.setFooter(`page ${currentPage}/${lastPage}`)
                await msg.edit({embeds: [newEmbed]})
                return pageManager()
            }
        }
    }

    return pageManager()
}

cmd.setRun(run)

module.exports = cmd
