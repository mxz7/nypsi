const { Message, MessageActionRow, MessageButton } = require("discord.js")
const fetch = require("node-fetch")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium, getTier } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")
const { info, types } = require("../utils/logger")
const { getNameHistory } = require("mc-names")

const cooldown = new Map()
const serverCache = new Map()

const cmd = new Command(
    "minecraft",
    "view information about a minecraft account",
    categories.MINECRAFT
).setAliases(["mc"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        if (getTier(message.author.id) == 4) {
            cooldownLength = 2
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
        return message.channel.send({embeds: [new ErrorEmbed(`${prefix}minecraft <name/server IP>`)]})
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    if (args[0].includes(".")) {
        const serverIP = args[0]
        const url = "https://api.mcsrvstat.us/2/" + serverIP.toLowerCase()
        let res
        let invalid = false

        if (serverCache.has(serverIP.toLowerCase())) {
            res = serverCache.get(serverIP.toLowerCase())
        } else {
            res = await fetch(url)
                .then((url) => url.json())
                .catch(() => {
                    invalid = true
                })
            if (!invalid) {
                serverCache.set(serverIP.toLowerCase(), res)
                setTimeout(() => {
                    serverCache.delete(serverIP.toLowerCase())
                }, 600000)
            } else {
                return message.channel.send({embeds: [new ErrorEmbed("invalid server")]})
            }
        }

        const embed = new CustomEmbed(message.member, true)
            .setTitle(args[0] + " | " + res.ip + ":" + res.port)
            .addField(
                "players",
                res.players.online.toLocaleString() + "/" + res.players.max.toLocaleString(),
                true
            )
            .addField("version", res.version, true)
            .addField("motd", res.motd.clean)

        return message.channel.send({ embeds: [embed] })
    }

    let username = args[0]

    const nameHistory = await getNameHistory(username)

    if (!nameHistory) {
        return await message.channel.send({embeds: [new ErrorEmbed("invalid account")]})
    }

    const skin = `https://mc-heads.net/avatar/${nameHistory.uuid}/256`

    username = nameHistory.username

    const names = nameHistory.toPages(7, "`$username` | `$date`")

    const embed = new CustomEmbed(message.member, false, names.get(1).join("\n"))
        .setTitle(username)
        .setURL("https://namemc.com/profile/" + username)
        .setThumbnail(skin)

    if (names.size >= 2) {
        embed.setFooter(`page 1/${names.size}`)
    }

    /**
     * @type {Message}
     */
    let msg

    let row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
    )

    if (names.size >= 2) {
        msg = await message.channel.send({ embeds: [embed], components: [row] })
    } else {
        return await message.channel.send({ embeds: [embed] })
    }


    if (names.size >= 2) {
        let currentPage = 1
        const lastPage = names.size

        const filter = (i) => i.user.id == message.author.id

        const pageManager = async () => {
            const reaction = await msg
                .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
                .then(async (collected) => {
                    await collected.deferUpdate()
                    return collected.customId
                })
                .catch(async () => {
                    await msg.edit({ embeds: [embed], components: []})
                })

            if (!reaction) return

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager()
                } else {
                    currentPage--
                    embed.setDescription(names.get(currentPage).join("\n"))
                    embed.setFooter("page " + currentPage + "/" + lastPage)
                    if (currentPage == 1) {
                        row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                        )
                    } else {
                        let row = new MessageActionRow().addComponents(
                            new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(false),
                            new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY").setDisabled(false)
                        )
                    }
                    await msg.edit({ embeds: [embed], components: [row] })
                    return pageManager()
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager()
                } else {
                    currentPage++
                    embed.setDescription(names.get(currentPage).join("\n"))
                    embed.setFooter("page " + currentPage + "/" + lastPage)
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
                    await msg.edit({embeds: [embed], components: [row]})
                    return pageManager()
                }
            }
        }
        return pageManager()
    }
}

setInterval(() => {
    if (serverCache.size > 7) {
        serverCache.clear()
        info("minecraft server cache cleared", types.AUTOMATION)
    }
}, 6 * 60 * 60 * 1000)

cmd.setRun(run)

module.exports = cmd
