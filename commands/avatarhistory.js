const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { isPremium } = require("../utils/premium/utils")
const {
    usernameProfileExists,
    createUsernameProfile,
    fetchAvatarHistory,
    addNewAvatar,
    clearAvatarHistory,
} = require("../utils/users/utils")
const { getMember, formatDate, uploadImage } = require("../utils/utils")

const cmd = new Command(
    "avatarhistory",
    "view a user's avatar history",
    categories.INFO
).setAliases(["avh", "avhistory", "pfphistory", "pfph"])

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
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (args[0].toLowerCase() == "-clear") {
            clearAvatarHistory(message.member)
            return message.channel.send(
                new CustomEmbed(message.member, false, "✅ your avatar history has been cleared")
            )
        }

        if (!message.mentions.members.first()) {
            member = await getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return message.channel.send(new ErrorEmbed("invalid user"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (!usernameProfileExists(member)) createUsernameProfile(member)

    let history = fetchAvatarHistory(member)

    if (history.length == 0) {
        const url = await uploadImage(
            member.user.displayAvatarURL({ format: "png", dynamic: "true", size: 256 })
        )
        if (url) {
            addNewAvatar(member, url)
            history = fetchAvatarHistory(member)
        } else {
            return message.channel.send(new ErrorEmbed("no avatar history"))
        }
    }

    let index = 0

    if (parseInt(args[1] - 1)) {
        index = parseInt(args[1] - 1)

        if (!history[index]) index = 0
    }

    const embed = new CustomEmbed(message.member, true)
        .setTitle(`${member.user.tag} [${index + 1}]`)
        .setImage(history[index].value)
        .setFooter(formatDate(history[index].date))

    if (history.length > 1) {
        embed.setFooter(`${formatDate(history[index].date)} | ${index + 1}/${history.length}`)
    }

    const msg = await message.channel.send(embed)

    if (history.length == 1) return

    await msg.react("⬅")
    await msg.react("➡")

    let currentPage = index + 1
    const lastPage = history.length

    const filter = (reaction, user) => {
        return ["⬅", "➡"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    const pageManager = async () => {
        const reaction = await msg
            .awaitReactions(filter, { max: 1, time: 30000, errors: ["time"] })
            .then((collected) => {
                return collected.first().emoji.name
            })
            .catch(async () => {
                await msg.reactions.removeAll()
            })

        if (!reaction) return

        const newEmbed = new CustomEmbed(message.member, false)

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--

                newEmbed.setTitle(`${member.user.tag} [${currentPage}]`)
                newEmbed.setImage(history[currentPage - 1].value)
                newEmbed.setFooter(
                    `${formatDate(history[currentPage - 1].date)} | ${currentPage}/${
                        history.length
                    }`
                )

                await msg.edit(newEmbed)
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage >= lastPage) {
                return pageManager()
            } else {
                currentPage++

                newEmbed.setTitle(`${member.user.tag} [${currentPage}]`)
                newEmbed.setImage(history[currentPage - 1].value)
                newEmbed.setFooter(
                    `${formatDate(history[currentPage - 1].date)} | ${currentPage}/${
                        history.length
                    }`
                )

                await msg.edit(newEmbed)
                return pageManager()
            }
        }
    }

    return pageManager()
}

cmd.setRun(run)

module.exports = cmd
