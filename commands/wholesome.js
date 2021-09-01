const { Message } = require("discord.js")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const {
    getWholesomeImage,
    suggestWholesomeImage,
    formatDate,
    acceptWholesomeImage,
    denyWholesomeImage,
    deleteFromWholesome,
    clearWholesomeCache,
    getMember,
    getAllSuggestions,
    uploadImage,
} = require("../utils/utils")
const { getPrefix } = require("../utils/guilds/utils")
const e = require("express")
const isImageUrl = require("is-image-url")

const cooldown = new Map()
const uploadCooldown = new Map()

const cmd = new Command("wholesome", "get a random wholesome picture", categories.FUN).setAliases([
    "iloveyou",
    "loveu",
    "ws",
    "ily",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        cooldownLength = 1
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

    const embed = new CustomEmbed(message.member)

    let target

    if (args.length == 0) {
        const image = getWholesomeImage()

        embed.setHeader(`<3 | #${image.id}`)
        embed.setImage(image.image)
    } else if (
        args[0].toLowerCase() == "add" ||
        args[0].toLowerCase() == "suggest" ||
        args[0].toLowerCase() == "+"
    ) {
        if (uploadCooldown.has(message.member.id)) {
        const init = uploadCooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 60 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
            
        return message.channel.send(new ErrorEmbed(`you are on upload cooldown for \`${remaining}\``))
    }

        if (args.length == 1 && !message.attachments.first()) {
            return message.channel.send(
                new ErrorEmbed(`${getPrefix(message.guild)}wholesome suggest <imgur url>`)
            )
        }

        let url = args[1]

        if (message.attachments.first()) {
            url = message.attachments.first().url
        }

        if (!url.toLowerCase().startsWith("https")) {
            return message.channel.send(new ErrorEmbed("must be http**s**"))
        }

        if (!url.toLowerCase().startsWith("https://i.imgur.com/")) {
            if (!isImageUrl(url)) {
                return message.channel.send(
                    new ErrorEmbed(
                        "must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"
                    )
                )
            }

            const upload = await uploadImage(url)

            if (!upload) {
                return message.channel.send(
                    new ErrorEmbed(
                        "must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"
                    )
                )
            } else {
                url = upload
            }
        }

        const res = await suggestWholesomeImage(message.member, url)

        if (!res) {
            return message.channel.send(
                new ErrorEmbed(
                    `error: maybe that image already exists? if this persists join the ${getPrefix(
                        message.guild
                    )}support server`
                )
            )
        }

        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        uploadCooldown.set(message.member.id, new Date())

        setTimeout(() => {
            uploadCooldown.delete(message.author.id)
        }, 60 * 1000)

        return message.react("✅")
    } else if (args[0].toLowerCase() == "get") {
        if (message.author.id != "672793821850894347") return

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("dumbass"))
        }

        const wholesome = getWholesomeImage(parseInt(args[1]))

        if (!wholesome) {
            return message.react("❌")
        }

        embed.setTitle(`image #${wholesome.id}`)

        embed.setDescription(
            `**suggested by** ${wholesome.submitter} (${wholesome.submitter_id})\n**accepted by** \`${wholesome.accepter}\`\n**url** ${wholesome.image}`
        )
        embed.setImage(wholesome.image)
        embed.setFooter(`submitted on ${formatDate(wholesome.date)}`)
    } else if (args[0].toLowerCase() == "accept" || args[0].toLowerCase() == "a") {
        if (message.guild.id != "747056029795221513") return

        const roles = message.member.roles.cache

        let allow = false

        if (roles.has("747056620688900139")) allow = true
        if (roles.has("747059949770768475")) allow = true
        if (roles.has("845613231229370429")) allow = true

        if (!allow) return

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("you must include the suggestion id"))
        }

        const res = await acceptWholesomeImage(parseInt(args[1]), message.member)

        if (!res) {
            return message.channel.send(
                new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)
            )
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
            return message.channel.send(new ErrorEmbed("you must include the suggestion id"))
        }

        const res = await denyWholesomeImage(parseInt(args[1]))

        if (!res) {
            return message.channel.send(
                new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)
            )
        }

        return message.react("✅")
    } else if (args[0].toLowerCase() == "delete") {
        if (message.author.id != "672793821850894347") return

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("dumbass"))
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
            if (embed.embed.fields.length >= 6) break

            embed.addField(
                image.id,
                `**suggested** ${image.submitter} (${image.submitter_id})\n**url** ${image.image}`
            )
        }

        embed.setTitle("wholesome queue")

        if (queue.length == 0) {
            embed.setDescription("no wholesome suggestions")
        }

        if (pages.size != 0) {
            embed.setFooter(`page 1/${pages.size}`)
        }

        const msg = await message.channel.send(embed)

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
                .awaitReactions(filter, { max: 1, time: 30000, errors: ["time"] })
                .then((collected) => {
                    return collected.first().emoji.name
                })
                .catch(async () => {
                    await msg.reactions.removeAll()
                })

            if (!reaction) return

            const newEmbed = new CustomEmbed(message.member, false).setTitle("wholesome queue")

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
                    await msg.edit(newEmbed)
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
                    await msg.edit(newEmbed)
                    return pageManager()
                }
            }
        }

        return pageManager()
    } else {
        let member

        if (!message.mentions.members.first()) {
            member = await getMember(message, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }

        if (member) {
            target = member
        } else {
            return message.channel.send(new ErrorEmbed("couldnt find that member ):"))
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

    if (chance == 7)
        embed.setFooter(
            `submit your own image with ${getPrefix(message.guild)}wholesome suggest (:`
        )

    if (target) {
        return message.channel.send(
            `${target.user.toString()} you've received a wholesome image (:`,
            embed
        )
    }

    return message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd
