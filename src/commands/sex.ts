import { CommandInteraction, Message } from "discord.js"
import { getDMsEnabled } from "../utils/economy/utils.js"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"

const cmd = new Command("sex", "find horny milfs in ur area 😏", Categories.FUN).setAliases([
    "findhornymilfsinmyarea",
    "milffinder",
    "findamilf",
    "letsfuck",
])

cmd.slashEnabled = true
cmd.slashData.addStringOption((option) => option.setName("message").setDescription("a good pickup line always works (;"))

const cooldown = new Map()
const chastityCooldown = new Map()
const looking = new Map()

const descFilter = ["nigger", "nigga", "faggot", "fag", "nig", "ugly", "discordgg", "discordcom", "discordappcom"]

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 30

    if (isPremium(message.author.id)) {
        cooldownLength = 10
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

    if (chastityCooldown.has(message.member.user.id)) {
        const init = chastityCooldown.get(message.member.user.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 10800 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }

        return send({
            embeds: [
                new ErrorEmbed(`you have been equipped with a *chastity cage*, it will be removed in **${remaining}**`),
            ],
        })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const addToLooking = (description) => {
        const obj = {
            user: message.author,
            guild: message.guild,
            channel: message.channel.id,
            description: description,
            date: new Date().getTime(),
        }

        looking.set(message.author.id, obj)
    }

    let description = ""

    if (args.length > 0) {
        description = args.join(" ")
        const descriptionCheck = description.replace(/[^A-z0-9\s]/g, "")

        for (const word of descFilter) {
            if (descriptionCheck.includes(word)) {
                description = ""
                break
            }
        }
        if (description.length > 50) {
            description = description.substr(0, 50) + "..."
        }
    }

    if (looking.size == 0) {
        addToLooking(description)
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found"
                ).setTitle("milf finder"),
            ],
        })
    } else {
        if (looking.has(message.author.id)) {
            return send({
                embeds: [new ErrorEmbed("we're already searching for a match.. calm down you horny shit")],
            })
        }

        for (let key of looking.keys()) {
            key = looking.get(key)

            if (message.guild.id == key.guild.id) continue

            looking.delete(key.user.id)

            const embed = new CustomEmbed(
                message.member,
                true,
                `a match has been made from **${key.guild.name}**\n\n` +
                    `go ahead and send **${key.user.tag}** a *private* message 😉😏`
            ).setTitle("milf finder")

            if (key.description != "") {
                embed.setDescription(
                    `a match has been made from **${key.guild.name}**\n\n` +
                        `**${key.user.tag}** - ${key.description}\n\n` +
                        "go ahead and send them a *private* message 😉😏"
                )
            }

            await send({ embeds: [embed] })

            const channel = await key.guild.channels.cache.find((ch) => ch.id == key.channel)

            const embed2 = new CustomEmbed(
                undefined,
                true,
                `a match has been made from **${message.guild.name}**\n\ngo ahead and send **${message.author.tag}** a *private* message 😉😏`
            )
                .setTitle("milf finder")
                .setColor("#5efb8f")

            if (description != "") {
                embed2.setDescription(
                    `a match has been made from **${message.guild.name}**\n\n` +
                        `**${message.author.tag}** - ${description}\n\n` +
                        "go ahead and send them a *private* message 😉😏"
                )
            }

            return await channel.send({ content: key.user.toString() + " a match has been found", embeds: [embed2] })
        }

        addToLooking(description)
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found"
                ).setTitle("milf finder"),
            ],
        })
    }
}

cmd.setRun(run)

module.exports = cmd

setInterval(() => {
    if (looking.size == 0) return

    const now = new Date().getTime()

    const expire = 10800000

    looking.forEach(async (obj) => {
        if (now - obj.date >= expire) {
            if (getDMsEnabled(obj.user.id)) {
                await obj.user
                    .send({
                        embeds: [
                            new CustomEmbed(undefined, false, "unfortunately we couldn't find you a milf 😢")
                                .setColor("#e4334f")
                                .setTitle("milf finder"),
                        ],
                    })
                    .catch(() => {})
            }

            looking.delete(obj.user.id)
        }
    })
}, 600000)

/**
 *
 * @param {String} id
 */
function addChastityCooldown(id) {
    if (looking.has(id)) {
        looking.delete(id)
    }

    chastityCooldown.set(id, new Date())

    setTimeout(() => {
        chastityCooldown.delete(id)
    }, 10800000)
}

/**
 *
 * @param {String} id
 * @returns {Boolean}
 */
function onChastityCooldown(id) {
    return chastityCooldown.has(id)
}

/**
 *
 * @param {String} id
 */
function deleteChastityCooldown(id) {
    chastityCooldown.delete(id)
}

cmd.data = {
    deleteChastityCooldown: deleteChastityCooldown,
    onChastityCooldown: onChastityCooldown,
    addChastityCooldown: addChastityCooldown,
}
