import { CommandInteraction, Message } from "discord.js"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getPrefix } from "../utils/guilds/utils"
import {
    acceptWholesomeImage,
    clearWholesomeCache,
    deleteFromWholesome,
    denyWholesomeImage,
    getAllSuggestions,
    getWholesomeImage,
    isImageUrl,
    suggestWholesomeImage,
    uploadImageToImgur,
} from "../utils/functions/image"
import { formatDate } from "../utils/functions/date"
import { getMember } from "../utils/functions/member"

const cooldown = new Map()
const uploadCooldown = new Map()

const cmd = new Command("wholesome", "get a random wholesome picture", Categories.FUN).setAliases([
    "iloveyou",
    "loveu",
    "ws",
    "ily",
])

cmd.slashEnabled = true

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        cooldownLength = 1
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
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
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    const embed = new CustomEmbed(message.member)

    let target

    if (args.length == 0 || !(message instanceof Message)) {
        const image = getWholesomeImage()

        embed.setHeader(`<3 | #${image.id}`)
        embed.setImage(image.image)
    } else if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "suggest" || args[0].toLowerCase() == "+") {
        if (uploadCooldown.has(message.member.id)) {
            const init = uploadCooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr.getTime() - init) / 1000)
            const time = 60 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining: string

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }

            return send({
                embeds: [new ErrorEmbed(`you are on upload cooldown for \`${remaining}\``)],
            })
        }

        if (args.length == 1 && !message.attachments.first()) {
            return send({
                embeds: [new ErrorEmbed(`${getPrefix(message.guild)}wholesome suggest <imgur url>`)],
            })
        }

        let url = args[1]

        if (message.attachments.first()) {
            url = message.attachments.first().url
        }

        if (!url.toLowerCase().startsWith("https")) {
            return send({ embeds: [new ErrorEmbed("must be http**s**")] })
        }

        if (!url.toLowerCase().startsWith("https://i.imgur.com/")) {
            if (!isImageUrl(url)) {
                return send({
                    embeds: [
                        new ErrorEmbed(
                            "must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"
                        ),
                    ],
                })
            }

            const upload = await uploadImageToImgur(url)

            if (!upload) {
                return send({
                    embeds: [
                        new ErrorEmbed(
                            "must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"
                        ),
                    ],
                })
            } else {
                uploadCooldown.set(message.member.id, new Date())

                setTimeout(() => {
                    uploadCooldown.delete(message.author.id)
                }, 60 * 1000)
                url = upload
            }
        }

        const res = await suggestWholesomeImage(message.member, url)

        if (!res) {
            return send({
                embeds: [
                    new ErrorEmbed(
                        `error: maybe that image already exists? if this persists join the ${getPrefix(
                            message.guild
                        )}support server`
                    ),
                ],
            })
        }

        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        return message.react("✅")
    } else if (args[0].toLowerCase() == "get") {
        if (message.author.id != "672793821850894347") return

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("dumbass")] })
        }

        const wholesome = getWholesomeImage(parseInt(args[1]))

        if (!wholesome) {
            return message.react("❌")
        }

        embed.setHeader(`image #${wholesome.id}`)

        embed.setDescription(
            `**suggested by** ${wholesome.submitter} (${wholesome.submitter_id})\n**accepted by** \`${wholesome.accepter}\`\n**url** ${wholesome.image}`
        )
        embed.setImage(wholesome.image)
        embed.setFooter(`submitted on ${formatDate(wholesome.upload)}`)
    } else if (args[0].toLowerCase() == "accept" || args[0].toLowerCase() == "a") {
        if (message.guild.id != "747056029795221513") return

        const roles = message.member.roles.cache

        let allow = false

        if (roles.has("747056620688900139")) allow = true
        if (roles.has("747059949770768475")) allow = true
        if (roles.has("845613231229370429")) allow = true

        if (!allow) return

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("you must include the suggestion id")] })
        }

        const res = await acceptWholesomeImage(parseInt(args[1]), message.member)

        if (!res) {
            return send({
                embeds: [new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)],
            })
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "deny" || args[0].toLowerCase() == "d") {
        if (message.guild.id != "747056029795221513") return

        const roles = message.member.roles.cache

        let allow = false

        if (roles.has("747056620688900139")) allow = true
        if (roles.has("747059949770768475")) allow = true
        if (roles.has("845613231229370429")) allow = true

        if (!allow) return

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("you must include the suggestion id")] })
        }

        const res = await denyWholesomeImage(parseInt(args[1]))

        if (!res) {
            return send({
                embeds: [new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)],
            })
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "delete") {
        if (message.author.id != "672793821850894347") return

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("dumbass")] })
        }

        const res = await deleteFromWholesome(parseInt(args[1]))

        if (!res) {
            return message.react("❌")
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "reload") {
        if (message.author.id != "672793821850894347") return

        clearWholesomeCache()

        return message.react("✅")
    } else if (args[0].toLowerCase() == "queue" || args[0].toLowerCase() == "q") {
        if (message.guild.id != "747056029795221513") return

        const roles = message.member.roles.cache

        let allow = false

        if (roles.has("747056620688900139")) allow = true
        if (roles.has("747059949770768475")) allow = true
        if (roles.has("845613231229370429")) allow = true

        if (!allow) return

        const queue = getAllSuggestions()

        const pages = new Map()

        if (queue.length > 6) {
            for (const image of queue) {
                if (pages.size == 0) {
                    pages.set(1, [image])
                } else {
                    if (pages.get(pages.size).length >= 6) {
                        pages.set(pages.size + 1, [image])
                    } else {
                        const current = pages.get(pages.size)
                        current.push(image)
                        pages.set(pages.size, current)
                    }
                }
            }
        }

        for (const image of queue) {
            if (embed.fields.length >= 6) break

            embed.addField(
                image.id.toString(),
                `**suggested** ${image.submitter} (${image.submitter_id})\n**url** ${image.image}`
            )
        }

        embed.setHeader("wholesome queue")

        if (queue.length == 0) {
            embed.setDescription("no wholesome suggestions")
        }

        if (pages.size != 0) {
            embed.setFooter(`page 1/${pages.size}`)
        }

        const msg = await send({ embeds: [embed] })

        if (pages.size == 0) return

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

            const newEmbed = new CustomEmbed(message.member, false).setHeader("wholesome queue")

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager()
                } else {
                    currentPage--

                    for (const image of pages.get(currentPage)) {
                        newEmbed.addField(
                            image.id,
                            `**suggested** ${image.submitter} (${image.submitter_id})\n**url** ${image.image})`
                        )
                    }

                    newEmbed.setFooter(`page ${currentPage}/${lastPage}`)
                    await msg.edit({ embeds: [newEmbed] })
                    return pageManager()
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager()
                } else {
                    currentPage++

                    for (const image of pages.get(currentPage)) {
                        newEmbed.addField(
                            image.id,
                            `**suggested** ${image.submitter} (${image.submitter_id})\n**url** ${image.image})`
                        )
                    }

                    newEmbed.setFooter(`page ${currentPage}/${lastPage}`)
                    await msg.edit({ embeds: [newEmbed] })
                    return pageManager()
                }
            }
        }

        return pageManager()
    } else {
        let member

        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }

        if (member) {
            target = member
        } else {
            return send({ embeds: [new ErrorEmbed("couldnt find that member ):")] })
        }

        const image = getWholesomeImage()

        embed.setHeader(`<3 | #${image.id}`)
        embed.setImage(image.image)
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const chance = Math.floor(Math.random() * 25)

    if (chance == 7) embed.setFooter(`submit your own image with ${getPrefix(message.guild)}wholesome suggest (:`)

    if (target) {
        return send({
            content: `${target.user.toString()} you've received a wholesome image (:`,
            embeds: [embed],
        })
    }

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
