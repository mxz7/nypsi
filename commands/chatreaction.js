const { Message, Permissions, MessageActionRow, MessageButton } = require("discord.js")
const {
    createReactionProfile,
    hasReactionProfile,
    startReaction,
    getReactionStats,
    hasReactionStatsProfile,
    createReactionStatsProfile,
    getServerLeaderboard,
    getWordList,
    updateWords,
    getReactionSettings,
    updateReactionSettings,
    getBlacklisted,
    setBlacklisted,
    deleteStats,
} = require("../utils/chatreactions/utils")
const { getPrefix } = require("../utils/guilds/utils")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("chatreaction", "see who can type the fastest", categories.FUN).setAliases(["cr", "reaction"])

cmd.slashEnabled = true
cmd.slashData
    .addSubcommand((option) => option.setName("start").setDescription("start a chat reaction in the current channel"))
    .addSubcommand((option) => option.setName("stats").setDescription("view your chat reaction stats"))
    .addSubcommand((option) => option.setName("leaderboard").setDescription("view the chat reaction leaderboard"))
    .addSubcommandGroup((words) =>
        words
            .setName("words")
            .setDescription("add or remove words from the chat reactions word list")
            .addSubcommand((list) => list.setName("list").setDescription("show the current word list"))
            .addSubcommand((reset) => reset.setName("reset").setDescription("reset the word list back to default"))
            .addSubcommand((add) =>
                add
                    .setName("add")
                    .setDescription("add word")
                    .addStringOption((option) =>
                        option
                            .setName("word")
                            .setDescription("what word would you like to add to the word list")
                            .setRequired(true)
                    )
            )
            .addSubcommand((remove) =>
                remove
                    .setName("del")
                    .setDescription("remove word")
                    .addStringOption((option) =>
                        option
                            .setName("word")
                            .setDescription("what word would you like to remove from the word list")
                            .setRequired(true)
                    )
            )
    )
    .addSubcommandGroup((blacklist) =>
        blacklist
            .setName("blacklist")
            .setDescription("ban a user from chat reactions")
            .addSubcommand((list) => list.setName("list").setDescription("view currently blacklisted users"))
            .addSubcommand((add) =>
                add
                    .setName("add")
                    .setDescription("add a user to the blacklist")
                    .addUserOption((option) =>
                        option.setName("user").setDescription("user to be blacklisted").setRequired(true)
                    )
            )
            .addSubcommand((remove) =>
                remove
                    .setName("del")
                    .setDescription("remove a user from the blacklist")
                    .addUserOption((option) =>
                        option.setName("user").setDescription("user to remove from the blacklist").setRequired(true)
                    )
            )
    )
    .addSubcommandGroup((settings) =>
        settings
            .setName("settings")
            .setDescription("settings for chat reactions")
            .addSubcommand((view) => view.setName("view").setDescription("view the current configuration"))
            .addSubcommand((enable) =>
                enable.setName("enable").setDescription("enable chat reactions for the current channel")
            )
            .addSubcommand((disable) => disable.setName("disable").setDescription("disable chat reactions"))
            .addSubcommand((offset) =>
                offset
                    .setName("offset")
                    .setDescription("set a maximum offset to be used with the cooldown")
                    .addIntegerOption((option) =>
                        option.setName("seconds").setDescription("maximum offset").setRequired(true)
                    )
            )
            .addSubcommand((length) =>
                length
                    .setName("length")
                    .setDescription("set the max time a chat reaction can last")
                    .addIntegerOption((option) =>
                        option.setName("seconds").setDescription("amount of time a chat reaction can last").setRequired(true)
                    )
            )
            .addSubcommand((cooldown) =>
                cooldown
                    .setName("cooldown")
                    .setDescription("set the time between automatic chat reactions")
                    .addIntegerOption((option) =>
                        option.setName("seconds").setDescription("time between chat reactions").setRequired(true)
                    )
            )
            .addSubcommand((channel) =>
                channel
                    .setName("channel")
                    .setDescription("add/remove a channel for automatic chat reactions")
                    .addChannelOption((option) =>
                        option
                            .setName("channel")
                            .setDescription("channel to add/remove from automatic starting")
                            .setRequired(true)
                    )
            )
    )

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 10

    if (isPremium(message.author.id)) {
        cooldownLength = 5
    }

    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
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
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (!hasReactionProfile(message.guild)) createReactionProfile(message.guild)
    if (!hasReactionStatsProfile(message.guild, message.member)) createReactionStatsProfile(message.guild, message.member)

    const prefix = getPrefix(message.guild)

    const helpCmd = () => {
        const embed = new CustomEmbed(message.member, true).setTitle("chat reactions")

        embed.setDescription(
            `${prefix}**cr start** *start a random chat reaction*\n` +
                `${prefix}**cr settings** *view/modify the chat reaction settings for your server*\n` +
                `${prefix}**cr words** *view/modify the chat reaction word list*\n` +
                `${prefix}**cr blacklist** *add/remove people to the blacklist*\n` +
                `${prefix}**cr stats** *view your chat reaction stats*\n` +
                `${prefix}**cr lb** *view the server leaderboard*`
        )

        return send({ embeds: [embed] })
    }

    const showStats = async () => {
        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        const embed = new CustomEmbed(message.member, false).setTitle(`${message.author.username}'s stats`)

        const stats = getReactionStats(message.guild, message.member)

        embed.addField(
            "your stats",
            `first place **${stats.wins}**\nsecond place **${stats.secondPlace}**\nthird place **${stats.thirdPlace}**`
        )

        const blacklisted = getBlacklisted(message.guild)

        if (blacklisted.indexOf(message.author.id) != -1) {
            embed.setFooter("you are blacklisted from chat reactions in this server")
        }

        return send({ embeds: [embed] })
    }

    const showLeaderboard = async () => {
        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        const embed = new CustomEmbed(message.member, false).setTitle("chat reactions leaderboard")

        let amount = 3

        if (parseInt(args[1])) {
            amount = parseInt(args[1])

            if (amount > 10) {
                if (!message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) amount = 10
            }
        }

        const leaderboards = await getServerLeaderboard(message.guild, amount)

        if (leaderboards.get("wins")) {
            embed.addField("first place", leaderboards.get("wins"), true)
        }

        if (leaderboards.get("second")) {
            embed.addField("second place", leaderboards.get("second"), true)
        }

        if (leaderboards.get("third")) {
            embed.addField("third place", leaderboards.get("third"), true)
        }

        if (leaderboards.get("overall")) {
            embed.addField("overall", leaderboards.get("overall"))
        }

        return send({ embeds: [embed] })
    }

    if (args.length == 0) {
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return showStats()
        return helpCmd()
    } else if (args[0].toLowerCase() == "start") {
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return
        const a = await startReaction(message.guild, message.channel)

        if (a == "xoxo69") {
            return send({
                embeds: [new ErrorEmbed("there is already a chat reaction in this channel")],
            })
        }
    } else if (args[0].toLowerCase() == "stats") {
        if (args.length == 2 && args[1].toLowerCase() == "reset") {
            if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
                if (message.author.id != message.guild.owner.id) {
                    return send({
                        embeds: [new ErrorEmbed("you need the to be the server owner for this command")],
                    })
                }
                deleteStats(message.guild)

                return send({
                    embeds: [new CustomEmbed(message.member, false, "✅ stats have been deleted")],
                })
            }
        }
        return showStats()
    } else if (args[0].toLowerCase() == "leaderboard" || args[0].toLowerCase() == "lb" || args[0].toLowerCase() == "top") {
        return showLeaderboard()
    } else if (args[0].toLowerCase() == "blacklist" || args[0].toLowerCase() == "bl") {
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
            return send({
                embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
            })
        }

        if (args.length == 1 || args[1].toLowerCase() == "list") {
            const embed = new CustomEmbed(message.member, false).setTitle("chat reactions |" + message.author.username)

            const blacklisted = getBlacklisted(message.guild)

            if (blacklisted.length == 0) {
                embed.setDescription("❌ no blacklisted users")
            } else {
                embed.setDescription(`\`${blacklisted.join("`\n`")}\``)
            }

            embed.setFooter(`use ${prefix}cr blacklist (add/del/+/-) to edit blacklisted users`)

            return send({ embeds: [embed] })
        } else {
            if (args[1].toLowerCase() == "add" || args[1] == "+") {
                if (args.length == 2) {
                    return send({ embeds: [new ErrorEmbed(`${prefix}cr blacklist add/+ @user`)] })
                }

                let user = args[2]

                if (user.length != 18) {
                    if (!message.mentions.members.first()) {
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "you need to mention a user, you can either use the user ID, or mention the user by putting @ before their name"
                                ),
                            ],
                        })
                    } else {
                        user = message.mentions.members.first()
                    }
                } else {
                    user = await message.guild.members.fetch(user)
                }

                if (!user) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                const blacklisted = getBlacklisted(message.guild)

                if (blacklisted.length >= 75) {
                    return send({
                        embeds: [new ErrorEmbed("you have reached the maximum amount of blacklisted users (75)")],
                    })
                }

                blacklisted.push(user.id)

                setBlacklisted(message.guild, blacklisted)

                const embed = new CustomEmbed(message.member, false, `✅ ${user.toString()} has been blacklisted`)

                return send({ embeds: [embed] })
            } else if (args[1].toLowerCase() == "del" || args[1] == "-") {
                if (args.length == 2) {
                    return send({ embeds: [new ErrorEmbed(`${prefix}cr blacklist del/- @user`)] })
                }

                let user = args[2]

                if (user.length != 18) {
                    if (!message.mentions.members.first()) {
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "you need to mention a user, you can either use the user ID, or mention the user by putting @ before their name"
                                ),
                            ],
                        })
                    } else {
                        user = message.mentions.members.first().id
                    }
                }

                if (!user) {
                    return send({ embeds: [new ErrorEmbed("invalid user")] })
                }

                const blacklisted = getBlacklisted(message.guild)

                if (blacklisted.indexOf(user) == -1) {
                    return send({ embeds: [new ErrorEmbed("this user is not blacklisted")] })
                }

                blacklisted.splice(blacklisted.indexOf(user), 1)

                setBlacklisted(message.guild, blacklisted)

                return send({
                    embeds: [new CustomEmbed(message.member, false, "✅ user has been unblacklisted")],
                })
            } else if (args[1].toLowerCase() == "reset" || args[1].toLowerCase() == "empty") {
                setBlacklisted(message.guild, [])

                return send({
                    embeds: [new CustomEmbed(message.member, false, "✅ blacklist was emptied")],
                })
            }
        }
    } else if (args[0].toLowerCase() == "settings") {
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
            return send({
                embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
            })
        }

        if (args.length == 1 || args[1].toLowerCase() == "view") {
            const embed = new CustomEmbed(message.member, false)

            embed.setTitle("chat reactions ")

            const settings = getReactionSettings(message.guild)

            let channels

            if (settings.randomChannels.length == 0) {
                channels = "none"
            } else {
                channels = settings.randomChannels.join("` `")
            }

            embed.setDescription(
                `**automatic start** \`${settings.randomStart}\`\n` +
                    `**random channels** \`${channels}\`\n` +
                    `**time between events** \`${settings.timeBetweenEvents}s\`\n` +
                    `**max offset** \`${settings.randomModifier}s\`\n` +
                    `**max game length** \`${settings.timeout}s\``
            )

            embed.setFooter(`use ${prefix}cr settings help to change this settings`)

            return send({ embeds: [embed] })
        } else if (args.length == 2) {
            if (args[1].toLowerCase() == "help") {
                const embed = new CustomEmbed(message.member, false)

                embed.setTitle("chat reactions")

                embed.setDescription(
                    `${prefix}**cr settings enable** *enable automatic starting*\n` +
                        `${prefix}**cr settings disable** *disable automatic starting*\n` +
                        `${prefix}**cr settings channel <channel>** *add/remove channels to be used for automatic starting*\n` +
                        `${prefix}**cr settings cooldown <seconds>** *set the time between automatic chat reactions*\n` +
                        `${prefix}**cr settings offset <seconds>** *set a maximum offset to be used with the cooldown*\n` +
                        `${prefix}**cr settings length <seconds>** *set a maximum game length*`
                )

                return send({ embeds: [embed] })
            } else if (args[1].toLowerCase() == "enable") {
                const settings = getReactionSettings(message.guild)

                if (settings.randomStart) {
                    return send({ embeds: [new ErrorEmbed("already enabled")] })
                }

                settings.randomStart = true

                if (settings.randomChannels.length == 0) {
                    settings.randomChannels.push(message.channel.id)
                }

                updateReactionSettings(message.guild, settings)

                return send({
                    embeds: [new CustomEmbed(message.member, false, "✅ automatic start has been enabled")],
                })
            } else if (args[1].toLowerCase() == "disable") {
                const settings = getReactionSettings(message.guild)

                if (!settings.randomStart) {
                    return send({ embeds: [new ErrorEmbed("already disabled")] })
                }

                settings.randomStart = false

                updateReactionSettings(message.guild, settings)

                return send({
                    embeds: [new CustomEmbed(message.member, false, "✅ automatic start has been disabled")],
                })
            } else if (args[1].toLowerCase() == "channel" || args[1].toLowerCase() == "channels") {
                return send({
                    embeds: [
                        new ErrorEmbed(
                            "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name"
                        ),
                    ],
                })
            } else if (args[1].toLowerCase() == "cooldown") {
                return send({
                    embeds: [new ErrorEmbed(`${prefix}cr settings cooldown <number>`)],
                })
            } else if (args[1].toLowerCase() == "offset") {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings offset <number>`)] })
            } else if (args[1].toLowerCase() == "length") {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings length <number>`)] })
            } else {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings help`)] })
            }
        } else if (args.length == 3) {
            if (args[1].toLowerCase() == "channel" || args[1].toLowerCase() == "channels") {
                let channel = args[2]

                if (channel.length != 18) {
                    if (!message.mentions.channels.first()) {
                        return send({
                            embeds: [
                                new ErrorEmbed(
                                    "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name\nto remove a channel, simply mention a channel or use an id of a channel that is already selected as a random channel"
                                ),
                            ],
                        })
                    } else {
                        channel = message.mentions.channels.first()
                    }
                } else {
                    channel = await message.guild.channels.cache.find((ch) => ch.id == channel)
                }

                if (!channel) {
                    return send({ embeds: [new ErrorEmbed("invalid channel")] })
                }

                const settings = getReactionSettings(message.guild)

                let added = false
                let max = 1

                if (isPremium(message.author.id)) {
                    max = 5
                }

                if (settings.randomChannels.indexOf(channel.id) != -1) {
                    settings.randomChannels.splice(settings.randomChannels.indexOf(channel.id), 1)
                } else {
                    if (settings.randomChannels.length >= max) {
                        const embed = new ErrorEmbed(
                            `you have reached the maximum amount of random channels (${max})\nyou can subscribe on [patreon](https://patreon.com/nypsi) to have more`
                        )

                        if (max > 1) {
                            embed.setDescription(`you have reached the maximum amount of random channels (${max})`)
                        }

                        return send({ embeds: [embed] })
                    }
                    settings.randomChannels.push(channel.id)
                    added = true
                }

                if (settings.randomChannels.length == 0) {
                    settings.randomStart = false
                }

                updateReactionSettings(message.guild, settings)

                const embed = new CustomEmbed(message.member, false)

                if (added) {
                    embed.setDescription(`${channel.name} has been added as a random channel`)
                } else {
                    embed.setDescription(`${channel.name} has been removed`)
                }

                return send({ embeds: [embed] })
            } else if (args[1].toLowerCase() == "cooldown") {
                const length = parseInt(args[2])

                if (!length) {
                    return send({
                        embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
                    })
                }

                if (length > 900) {
                    return send({ embeds: [new ErrorEmbed("cannot be longer than 900 seconds")] })
                }

                if (length < 120) {
                    return send({
                        embeds: [new ErrorEmbed("cannot be shorter than 120 seconds")],
                    })
                }

                const settings = getReactionSettings(message.guild)

                settings.timeBetweenEvents = length

                updateReactionSettings(message.guild, settings)

                return send({
                    embeds: [new CustomEmbed(message.member, false, `✅ event cooldown set to \`${length}s\``)],
                })
            } else if (args[1].toLowerCase() == "offset") {
                let length = parseInt(args[2])

                if (!length) {
                    return send({
                        embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
                    })
                }

                if (length > 900) {
                    return send({ embeds: [new ErrorEmbed("cannot be longer than 900 seconds")] })
                }

                if (length < 0) {
                    length = 0
                }

                const settings = getReactionSettings(message.guild)

                settings.randomModifier = length

                updateReactionSettings(message.guild, settings)

                return send({
                    embeds: [new CustomEmbed(message.member, false, `✅ cooldown max offset set to \`${length}s\``)],
                })
            } else if (args[1].toLowerCase() == "length") {
                const length = parseInt(args[2])

                if (!length) {
                    return send({
                        embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
                    })
                }

                if (length > 120) {
                    return send({ embeds: [new ErrorEmbed("cannot be longer than 120 seconds")] })
                }

                if (length < 30) {
                    return send({ embeds: [new ErrorEmbed("cannot be shorter than 30 seconds")] })
                }

                const settings = getReactionSettings(message.guild)

                settings.timeout = length

                updateReactionSettings(message.guild, settings)

                return send({
                    embeds: [new CustomEmbed(message.member, false, `✅ max length set to \`${length}s\``)],
                })
            } else {
                return send({ embeds: [new ErrorEmbed(`${prefix}cr settings help`)] })
            }
        }
    } else if (args[0].toLowerCase() == "words" || args[0].toLowerCase() == "word") {
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return
        if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
            return send({
                embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
            })
        }

        if (args.length == 1) {
            const embed = new CustomEmbed(message.member, false).setTitle("chat reactions")

            embed.setDescription(
                `${prefix}**cr words list** *view the current wordlist*\n` +
                    `${prefix}**cr words add/+ <word/sentence>** *add a word or sentence to the wordlist*\n` +
                    `${prefix}**cr words del/- <word/sentence>** *remove a word or sentence from the wordlist*\n` +
                    `${prefix}**cr words reset** *delete the custom word list and use the [default list](https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt)*`
            )

            return send({ embeds: [embed] })
        } else if (args[1].toLowerCase() == "add" || args[1] == "+") {
            if (args.length == 2) {
                return send({
                    embeds: [new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)],
                })
            }

            const words = getWordList(message.guild)

            const phrase = args.slice(2, args.length).join(" ")

            if (phrase == "" || phrase == " ") {
                return send({ embeds: [new ErrorEmbed("invalid phrase")] })
            }

            if (words.indexOf(phrase) != -1) {
                return send({
                    embeds: [new ErrorEmbed(`\`${phrase}\` already exists in the word list`)],
                })
            }

            let maxSize = 100

            if (isPremium(message.author.id)) {
                maxSize = 200
            }

            if (words.length >= maxSize) {
                const error = new ErrorEmbed(`wordlist is at max size (${maxSize})`)

                if (maxSize == 100) {
                    error.setFooter("become a patreon ($patreon) to double this limit")
                }

                return send({ embeds: [error] })
            }

            if (phrase.length >= 150) {
                return send({
                    embeds: [new ErrorEmbed("phrase is too long (150 characters max)")],
                })
            }

            words.push(phrase)

            updateWords(message.guild, words)

            return send({
                embeds: [new CustomEmbed(message.member, false, `✅ added \`${phrase}\` to wordlist`)],
            })
        } else if (args[1].toLowerCase() == "del" || args[1] == "-") {
            if (args.length == 2) {
                return send({
                    embeds: [new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)],
                })
            }

            const words = getWordList(message.guild)

            const phrase = args.slice(2, args.length).join(" ")

            if (words.indexOf(phrase) == -1) {
                return send({
                    embeds: [new ErrorEmbed(`\`${phrase}\` doesn't exist in the word list`)],
                })
            }

            words.splice(words.indexOf(phrase), 1)

            updateWords(message.guild, words)

            return send({
                embeds: [new CustomEmbed(message.member, false, `✅ removed \`${phrase}\` from wordlist`)],
            })
        } else if (args[1].toLowerCase() == "reset") {
            updateWords(message.guild, [])

            return send({
                embeds: [new CustomEmbed(message.member, false, "✅ wordlist has been reset")],
            })
        } else if (args[1].toLowerCase() == "list") {
            const words = getWordList(message.guild)

            const embed = new CustomEmbed(message.member, false)

            if (words.length == 0) {
                embed.setDescription(
                    "using [default word list](https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt)"
                )
                embed.setTitle("chat reactions")
            } else {
                /**
                 * @type {Map<Number, Array<String>>}
                 */
                const pages = new Map()

                for (let word of words) {
                    if (pages.size == 0) {
                        pages.set(1, [`\`${word}\``])
                    } else if (pages.get(pages.size).length >= 10) {
                        pages.set(pages.size + 1, [`\`${word}\``])
                    } else {
                        const d = pages.get(pages.size)

                        d.push(`\`${word}\``)

                        pages.set(pages.size, d)
                    }
                }

                embed.setTitle(`word list [${words.length}]`)
                embed.setDescription(`${pages.get(1).join("\n")}`)
                embed.setFooter(`page 1/${pages.size}`)

                if (pages.size > 1) {
                    let row = new MessageActionRow().addComponents(
                        new MessageButton().setCustomId("⬅").setLabel("back").setStyle("PRIMARY").setDisabled(true),
                        new MessageButton().setCustomId("➡").setLabel("next").setStyle("PRIMARY")
                    )
                    const msg = await send({ embeds: [embed], components: [row] })

                    let currentPage = 1
                    const lastPage = pages.size

                    const filter = (i) => i.user.id == message.author.id

                    const edit = async (data, msg) => {
                        if (message.interaction) {
                            await message.editReply(data)
                            return await message.fetchReply()
                        } else {
                            return await msg.edit(data)
                        }
                    }

                    const pageManager = async () => {
                        const reaction = await msg
                            .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
                            .then(async (collected) => {
                                await collected.deferUpdate()
                                return collected.customId
                            })
                            .catch(async () => {
                                await edit({ components: [] }, msg)
                            })

                        if (!reaction) return

                        if (reaction == "⬅") {
                            if (currentPage <= 1) {
                                return pageManager()
                            } else {
                                currentPage--
                                embed.setDescription(pages.get(currentPage).join("\n"))
                                embed.setFooter("page " + currentPage + "/" + lastPage)

                                if (currentPage == 1) {
                                    row = new MessageActionRow().addComponents(
                                        new MessageButton()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle("PRIMARY")
                                            .setDisabled(true),
                                        new MessageButton()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle("PRIMARY")
                                            .setDisabled(false)
                                    )
                                } else {
                                    row = new MessageActionRow().addComponents(
                                        new MessageButton()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle("PRIMARY")
                                            .setDisabled(false),
                                        new MessageButton()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle("PRIMARY")
                                            .setDisabled(false)
                                    )
                                }

                                await edit({ embeds: [embed], components: [row] }, msg)
                                return pageManager()
                            }
                        } else if (reaction == "➡") {
                            if (currentPage >= lastPage) {
                                return pageManager()
                            } else {
                                currentPage++
                                embed.setDescription(pages.get(currentPage).join("\n"))
                                embed.setFooter("page " + currentPage + "/" + lastPage)

                                if (currentPage == lastPage) {
                                    row = new MessageActionRow().addComponents(
                                        new MessageButton()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle("PRIMARY")
                                            .setDisabled(false),
                                        new MessageButton()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle("PRIMARY")
                                            .setDisabled(true)
                                    )
                                } else {
                                    row = new MessageActionRow().addComponents(
                                        new MessageButton()
                                            .setCustomId("⬅")
                                            .setLabel("back")
                                            .setStyle("PRIMARY")
                                            .setDisabled(false),
                                        new MessageButton()
                                            .setCustomId("➡")
                                            .setLabel("next")
                                            .setStyle("PRIMARY")
                                            .setDisabled(false)
                                    )
                                }

                                await edit({ embeds: [embed], components: [row] }, msg)
                                return pageManager()
                            }
                        }
                    }
                    return pageManager()
                }
            }

            return send({ embeds: [embed] })
        }
    }
}

cmd.setRun(run)

module.exports = cmd
