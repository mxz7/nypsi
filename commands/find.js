const { Message, Guild } = require("discord.js")
const { formatDate } = require("../utils/utils.js")
const { getPeaks } = require("../utils/guilds/utils")
const {
    getBalance,
    userExists,
    topAmount,
    topAmountGlobal,
    getBankBalance,
    getMaxBankBalance,
    getXp,
    hasVoted,
    getPrestige,
} = require("../utils/economy/utils.js")
const { categories, Command } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const _abc123 = new Command("find", "get info about users viewable to the bot", categories.NONE)

_abc123.setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return

    if (args.length == 0) return

    if (args[0] == "id") {
        if (args.length == 1) return

        const users = message.client.users.cache
        const guilds = message.client.guilds.cache

        let user = users.find((u) => u.id == args[1])
        if (!user) {
            user = await message.client.users.fetch(args[1])

            if (!user) {
                return message.react("❌")
            }
        }

        console.log(user)

        let guildNames = ""

        guilds.forEach((g) => {
            const abc = g.members.cache.find((u) => u.id == args[1])

            if (abc) {
                guildNames = guildNames + "`" + g.id + "` "
                user = abc
            }
        })

        const tag = `${user.username}#${user.discriminator}`

        const embed = new CustomEmbed(message.member, false, "`" + user.id + "`")
            .setTitle(tag)
            .addField("user info", "**tag** " + tag, true)

        if (userExists(user.id)) {
            let voted = false
            if (await hasVoted(user.id)) voted = true
            embed.addField(
                "economy",
                "💰 $**" +
                    getBalance(user.id).toLocaleString() +
                    "**\n" +
                    "💳 $**" +
                    getBankBalance(user.id).toLocaleString() +
                    "** / **" +
                    getMaxBankBalance(user.id).toLocaleString() +
                    "**\n" +
                    "**xp** " +
                    getXp(user.id).toLocaleString() +
                    "\n" +
                    "**voted** " +
                    voted +
                    "\n" +
                    "**prestige** " +
                    getPrestige(user.id),
                true
            )
        }

        if (guildNames != "") {
            embed.addField("guilds", guildNames)
        }

        message.channel.send(embed)
    } else if (args[0] == "tag") {
        if (args.length == 1) return

        const users = message.client.users.cache
        const guilds = message.client.guilds.cache

        let user = users.find((u) =>
            (u.username + "#" + u.discriminator).toLowerCase().includes(args[1])
        )

        if (!user) {
            return message.react("❌")
        }

        console.log(user)

        let guildNames = ""

        guilds.forEach((g) => {
            const abc = g.members.cache.find((u) => u.user.tag.toLowerCase().includes(args[1]))

            if (abc) {
                guildNames = guildNames + "`" + g.id + "` "
                user = abc
            }
        })

        const tag = `${user.username}#${user.discriminator}`

        const embed = new CustomEmbed(message.member, false, "`" + user.id + "`")
            .setTitle(tag)
            .addField("user info", "**tag** " + tag, true)

        if (userExists(user.id)) {
            let voted = false
            if (await hasVoted(user.id)) voted = true
            embed.addField(
                "economy",
                "💰 $**" +
                    getBalance(user.id).toLocaleString() +
                    "**\n" +
                    "💳 $**" +
                    getBankBalance(user.id).toLocaleString() +
                    "** / **" +
                    getMaxBankBalance(user.id).toLocaleString() +
                    "**\n" +
                    "**xp** " +
                    getXp(user.id).toLocaleString() +
                    "\n" +
                    "**voted** " +
                    voted +
                    "\n" +
                    "**prestige** " +
                    getPrestige(user.id),
                true
            )
        }

        if (guildNames != "") {
            embed.addField("guilds", guildNames)
        }

        message.channel.send(embed)
    } else if (args[0] == "gid") {
        if (args.length == 1) return

        const guild = message.client.guilds.cache.find((g) => g.id == args[1])

        if (!guild) {
            return message.react("❌")
        }

        if (args.join("").includes("-m")) {
            const members = guild.members.cache

            const names = new Map()

            members.forEach((m) => {
                if (names.size == 0) {
                    const value1 = []
                    value1.push("`" + m.user.tag + "`")
                    names.set(1, value1)
                } else {
                    const lastPage = names.size

                    if (names.get(lastPage).length >= 10) {
                        const value1 = []
                        value1.push("`" + m.user.tag + "`")
                        names.set(lastPage + 1, value1)
                    } else {
                        names.get(lastPage).push("`" + m.user.tag + "`")
                    }
                }
            })

            const embed = new CustomEmbed(message.member, false, names.get(1).join("\n")).setTitle(
                guild.name
            )

            const msg = await message.channel.send(embed)

            if (names.size >= 2) {
                await msg.react("⬅")
                await msg.react("➡")

                let currentPage = 1
                const lastPage = names.size

                const filter = (reaction, user) => {
                    return (
                        ["⬅", "➡"].includes(reaction.emoji.name) &&
                        user.id == message.member.user.id
                    )
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

                    if (reaction == "⬅") {
                        if (currentPage <= 1) {
                            return pageManager()
                        } else {
                            currentPage--
                            embed.setDescription(names.get(currentPage).join("\n"))
                            embed.setFooter("page " + currentPage)
                            await msg.edit(embed)
                            return pageManager()
                        }
                    } else if (reaction == "➡") {
                        if (currentPage >= lastPage) {
                            return pageManager()
                        } else {
                            currentPage++
                            embed.setDescription(names.get(currentPage).join("\n"))
                            embed.setFooter("page " + currentPage)
                            await msg.edit(embed)
                            return pageManager()
                        }
                    }
                }
                return pageManager()
            }
            return
        }

        const msg = await guildInfo(guild)

        message.channel.send(msg)
    } else if (args[0] == "gname") {
        if (args.length == 1) return

        args.shift()

        const guild = message.client.guilds.cache.find((g) =>
            g.name.toLowerCase().includes(args.join(" ").replace("-m", ""))
        )

        if (!guild) {
            return message.react("❌")
        }

        if (args.join("").includes("-m")) {
            const members = guild.members.cache

            const names = new Map()

            members.forEach((m) => {
                if (names.size == 0) {
                    const value1 = []
                    value1.push("`" + m.user.tag + "`")
                    names.set(1, value1)
                } else {
                    const lastPage = names.size

                    if (names.get(lastPage).length >= 10) {
                        const value1 = []
                        value1.push("`" + m.user.tag + "`")
                        names.set(lastPage + 1, value1)
                    } else {
                        names.get(lastPage).push("`" + m.user.tag + "`")
                    }
                }
            })

            const embed = new CustomEmbed(message.member, false, names.get(1).join("\n")).setTitle(
                guild.name
            )

            const msg = await message.channel.send(embed)

            if (names.size >= 2) {
                await msg.react("⬅")
                await msg.react("➡")

                let currentPage = 1
                const lastPage = names.size

                const filter = (reaction, user) => {
                    return (
                        ["⬅", "➡"].includes(reaction.emoji.name) &&
                        user.id == message.member.user.id
                    )
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

                    if (reaction == "⬅") {
                        if (currentPage <= 1) {
                            return pageManager()
                        } else {
                            currentPage--
                            embed.setDescription(names.get(currentPage).join("\n"))
                            embed.setFooter("page " + currentPage)
                            await msg.edit(embed)
                            return pageManager()
                        }
                    } else if (reaction == "➡") {
                        if (currentPage >= lastPage) {
                            return pageManager()
                        } else {
                            currentPage++
                            embed.setDescription(names.get(currentPage).join("\n"))
                            embed.setFooter("page " + currentPage)
                            await msg.edit(embed)
                            return pageManager()
                        }
                    }
                }
                return pageManager()
            }
            return
        }

        const msg = await guildInfo(guild)

        message.channel.send(msg)
    } else if (args[0] == "top") {
        let amount = 5

        if (args.length > 1 && parseInt(args[1])) {
            amount = parseInt(args[1])
        }

        const balTop = topAmountGlobal(amount)

        const filtered = balTop.filter(function (el) {
            return el != null
        })

        const embed = new CustomEmbed(message.member, false, filtered).setTitle(
            "top " + filtered.length
        )

        message.channel.send(embed)
    }
}

_abc123.setRun(run)

module.exports = _abc123

/**
 *
 * @param {Guild} guild
 */
async function guildInfo(guild) {
    const balTop = await topAmount(guild, 5)

    const filtered = balTop.filter(function (el) {
        return el != null
    })

    let owner

    try {
        owner = guild.owner.user.tag
    } catch (e) {
        owner = "`" + guild.ownerID + "`"
    }

    let invites

    try {
        invites = (await guild.fetchInvites().catch()).keyArray()
    } catch {
        invites = undefined
    }

    const embed = new CustomEmbed()
        .setDescription("`" + guild.id + "`")
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ format: "png", dynamic: true, size: 128 }))
        .addField(
            "info",
            "**owner** " +
                owner +
                "\n" +
                "**created** " +
                formatDate(guild.createdAt) +
                "\n" +
                "**region** " +
                guild.region,
            true
        )
        .addField(
            "info",
            "**roles** " +
                guild.roles.cache.size +
                "\n" +
                "**channels** " +
                guild.channels.cache.size,
            true
        )
        .addField(
            "member info",
            "**members** " +
                guild.memberCount.toLocaleString() +
                "\n" +
                "**member peak** " +
                getPeaks(guild).members.toLocaleString(),
            true
        )

    if (invites && invites.length > 0) {
        embed.addField(
            "invite (" + invites.length + ")",
            invites[Math.floor(Math.random() * invites.length)],
            true
        )
    }

    if (filtered.length > 0) {
        embed.addField("top " + filtered.length, filtered, true)
    }

    return embed
}
