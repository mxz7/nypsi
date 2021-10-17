const { Message, MessageActionRow, MessageButton } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { isPremium } = require("../utils/premium/utils")
const {
    usernameProfileExists,
    createUsernameProfile,
    fetchAvatarHistory,
    addNewAvatar,
    clearAvatarHistory,
    isTracking,
} = require("../utils/users/utils")
const { getMember, formatDate, uploadImage } = require("../utils/utils")

const cmd = new Command("avatarhistory", "view a user's avatar history", categories.INFO).setAliases([
    "avh",
    "avhistory",
    "pfphistory",
    "pfph",
])

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
            clearAvatarHistory(message.member)
            return message.channel.send({
                embeds: [new CustomEmbed(message.member, false, "✅ your avatar history has been cleared")],
            })
        }

        if (!message.mentions.members.first()) {
            member = await getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (!usernameProfileExists(member)) createUsernameProfile(member)

    let history = fetchAvatarHistory(member)

    if (history.length == 0) {
        const url = await uploadImage(member.user.displayAvatarURL({ format: "png", dynamic: "true", size: 256 }))
        if (url) {
            addNewAvatar(member, url)
            history = fetchAvatarHistory(member)
        } else {
            return message.channel.send({ embeds: [new ErrorEmbed("no avatar history")] })
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

    if (!isTracking(member)) {
        embed.setDescription("`[tracking disabled]`")
    }

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    /**
     * @type {Message}
     */
    let msg

    if (history.length == 1) {
        return await message.channel.send({ embeds: [embed] })
    } else {
        msg = await message.channel.send({ embeds: [embed], components: [row] })
    }

    let currentPage = index + 1
    const lastPage = history.length

    const filter = (i) => i.user.id == message.author.id

    const pageManager = async () => {
        const reaction = await msg
            .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
            .then(async (collected) => {
                await collected.deferUpdate()
                return collected.customId
            })
            .catch(async () => {
                await msg.edit({ components: [] })
            })

        if (!reaction) return

        const newEmbed = new CustomEmbed(message.member, false)

        if (!isTracking(member)) {
            newEmbed.setDescription("`[tracking disabled]`")
        }

        if (reaction == "⬅") {
            if (currentPage <= 1) {
                return pageManager()
            } else {
                currentPage--

                newEmbed.setTitle(`${member.user.tag} [${currentPage}]`)
                newEmbed.setImage(history[currentPage - 1].value)
                newEmbed.setFooter(`${formatDate(history[currentPage - 1].date)} | ${currentPage}/${history.length}`)
                if (currentPage == 1) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                }
                await msg.edit({ embeds: [newEmbed], components: [row] })
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage >= lastPage) {
                return pageManager()
            } else {
                currentPage++

                newEmbed.setTitle(`${member.user.tag} [${currentPage}]`)
                newEmbed.setImage(history[currentPage - 1].value)
                newEmbed.setFooter(`${formatDate(history[currentPage - 1].date)} | ${currentPage}/${history.length}`)
                if (currentPage == lastPage) {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(true)
                    )
                } else {
                    row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                    )
                }
                await msg.edit({ embeds: [newEmbed], components: [row] })
                return pageManager()
            }
        }
    }

    return pageManager()
}

cmd.setRun(run)

module.exports = cmd
