const { Message } = require("discord.js")
const {
    createReactionProfile,
    hasReactionProfile,
    getWords,
    startReaction,
    getReactionStats,
    hasReactionStatsProfile,
    createReactionStatsProfile,
    getServerLeaderboard,
    getWordList,
    updateWords,
    getReactionSettings,
    updateReactionSettings,
} = require("../chatreactions/utils")
const { getPrefix } = require("../guilds/utils")
const { isPremium } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")

const cmd = new Command("chatreaction", "see who can type the fastest", categories.FUN).setAliases([
    "cr",
    "reaction",
])

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

    if (!hasReactionProfile(message.guild)) createReactionProfile(message.guild)
    if (!hasReactionStatsProfile(message.guild, message.member))
        createReactionStatsProfile(message.guild, message.member)

    const prefix = getPrefix(message.guild)

    const helpCmd = () => {
        const embed = new CustomEmbed(message.member, true).setTitle(
            "chat reactions | " + message.author.username
        )

        embed.setDescription(
            `${prefix}**cr start** *start a random chat reaction*\n` +
                `${prefix}**cr settings** *view/modify the chat reaction settings for your server*\n` +
                `${prefix}**cr words** *view/modify the chat reaction word list*\n` +
                `${prefix}**cr blacklist** *add/remove people to the blacklist*\n` +
                `${prefix}**cr deleteall** *delete all chat reaction data*\n` +
                `${prefix}**cr stats** *view your chat reaction stats*\n` +
                `${prefix}**cr lb** *view the server leaderboard*`
        )

        return message.channel.send(embed)
    }

    const showStats = async () => {
        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        const embed = new CustomEmbed(message.member, false).setTitle(
            "chat reaction stats | " + message.author.username
        )

        const stats = getReactionStats(message.guild, message.member)

        embed.addField(
            "your stats",
            `first place **${stats.wins}**\nsecond place **${stats.secondPlace}**\nthird place **${stats.thirdPlace}**`
        )

        return message.channel.send(embed)
    }

    const showLeaderboard = async () => {
        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        const embed = new CustomEmbed(message.member, false).setTitle("chat reactions leaderboard")

        const leaderboards = await getServerLeaderboard(message.guild)

        if (leaderboards.get("wins")) {
            embed.addField("first place", leaderboards.get("wins"), true)
        }

        if (leaderboards.get("second")) {
            embed.addField("second place", leaderboards.get("second"), true)
        }
        if (leaderboards.get("third")) {
            embed.addField("third place", leaderboards.get("third"), true)
        }

        return message.channel.send(embed)
    }

    if (!message.member.hasPermission("MANAGE_MESSAGES")) return showStats()

    if (args.length == 0) {
        return helpCmd()
    } else if (args[0].toLowerCase() == "start") {
        const a = await startReaction(message.guild, message.channel)

        if (a == "xoxo69") {
            return message.channel.send(
                new ErrorEmbed("there is already a chat reaction in this channel")
            )
        }
    } else if (args[0].toLowerCase() == "stats") {
        return showStats()
    } else if (args[0].toLowerCase() == "lb" || args[0].toLowerCase() == "lb") {
        return showLeaderboard()
    } else if (args[0].toLowerCase() == "settings") {
        if (!message.member.hasPermission("MANAGE_GUILD")) {
            return message.channel.send(
                new ErrorEmbed("you need the `manage server` permission to do this")
            )
        }

        if (args.length == 1) {
            const embed = new CustomEmbed(message.member, false)

            embed.setTitle("chat reactions | " + message.author.username)

            const settings = getReactionSettings(message.guild)

            let channels

            if (settings.randomChannels.length == 0) {
                channels = "none"
            } else {
                channels = channels.join("` `")
            }

            embed.setDescription(
                `**automatic start** \`${settings.randomStart}\`\n` +
                    `**random channels** \`${channels}\`\n` +
                    `**time between events** \`${settings.timeBetweenEvents}s\`\n` +
                    `**max offset** \`${settings.randomModifier}s\`\n` +
                    `**max game length** \`${settings.timeout}s\``
            )

            embed.setFooter(`use ${prefix}cr settings help to change this settings`)

            return message.channel.send(embed)
        } else if (args.length == 2) {
            if (args[1].toLowerCase() == "help") {
                const embed = new CustomEmbed(message.member, false)

                embed.setTitle("chat reactions | " + message.author.username)

                embed.setDescription(
                    `${prefix}**cr settings enable** *enable automatic starting*\n` +
                        `${prefix}**cr settings disable** *disable automatic starting*\n` +
                        `${prefix}**cr settings channel <channel>** *add/remove channels to be used for automatic starting*\n` +
                        `${prefix}**cr settings cooldown <seconds>** *set the time between automatic chat reactions*\n` +
                        `${prefix}**cr settings offset <seconds>** *set a maximum offset to be used with the cooldown*\n` +
                        `${prefix}**cr settings length <seconds>** *set a maximum game length*`
                )

                return message.channel.send(embed)
            } else if (args[1].toLowerCase() == "enable") {
                const settings = getReactionSettings(message.guild)

                if (settings.randomStart) {
                    return message.channel.send(new ErrorEmbed("already enabled"))
                }

                settings.randomStart = true

                updateReactionSettings(message.guild, settings)

                return message.channel.send(
                    new CustomEmbed(message.member, false, "✅ automatic start has been enabled")
                )
            } else if (args[1].toLowerCase() == "disable") {
                const settings = getReactionSettings(message.guild)

                if (!settings.randomStart) {
                    return message.channel.send(new ErrorEmbed("already disabled"))
                }

                settings.randomStart = false

                updateReactionSettings(message.guild, settings)

                return message.channel.send(
                    new CustomEmbed(message.member, false, "✅ automatic start has been disabled")
                )
            } else {
                return message.channel.send(new ErrorEmbed(`${prefix}cr settings help`))
            }
        } else if (args.length == 3) {
            if (args[2].toLowerCase() == "channel" || args[2].toLowerCase() == "channels") {
                return message.channel.send(
                    new ErrorEmbed(
                        "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name"
                    )
                )
            }
        }
    } else if (args[0].toLowerCase() == "words" || args[0].toLowerCase() == "word") {
        if (!message.member.hasPermission("MANAGE_GUILD")) {
            return message.channel.send(
                new ErrorEmbed("you need the `manage server` permission to do this")
            )
        }

        if (args.length == 1) {
            const embed = new CustomEmbed(message.member, false).setTitle(
                "chat reactions | " + message.author.username
            )

            embed.setDescription(
                `${prefix}**cr words list** *view the current wordlist*\n` +
                    `${prefix}**cr words add/+ <word/sentence>** *add a word or sentence to the wordlist*\n` +
                    `${prefix}**cr words del/- <word/sentence>** *remove a word or sentence from the wordlist*\n` +
                    `${prefix}**cr words reset** *delete the custom word list and use the [default list](https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt)*`
            )

            return message.channel.send(embed)
        } else if (args[1].toLowerCase() == "add" || args[1] == "+") {
            if (args.length == 2) {
                return message.channel.send(
                    new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)
                )
            }

            const words = getWordList(message.guild)

            const phrase = args.slice(2, args.length).join(" ")

            if (phrase == "" || phrase == " ") {
                return message.channel.send(new ErrorEmbed("invalid phrase"))
            }

            if (words.indexOf(phrase) != -1) {
                return message.channel.send(
                    new ErrorEmbed(`\`${phrase}\` already exists in the word list`)
                )
            }

            if (words.length >= 100) {
                return message.channel.send(new ErrorEmbed("wordlist is at max size (100)"))
            }

            if (phrase.length >= 150) {
                return message.channel.send(
                    new ErrorEmbed("phrase is too long (150 characters max)")
                )
            }

            words.push(phrase)

            updateWords(message.guild, words)

            return message.channel.send(
                new CustomEmbed(message.member, false, `✅ added \`${phrase}\` to wordlist`)
            )
        } else if (args[1].toLowerCase() == "del" || args[1] == "-") {
            if (args.length == 2) {
                return message.channel.send(
                    new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)
                )
            }

            const words = getWordList(message.guild)

            const phrase = args.slice(2, args.length).join(" ")

            if (words.indexOf(phrase) == -1) {
                return message.channel.send(
                    new ErrorEmbed(`\`${phrase}\` doesn't exist in the word list`)
                )
            }

            words.splice(words.indexOf(phrase), 1)

            updateWords(message.guild, words)

            return message.channel.send(
                new CustomEmbed(message.member, false, `✅ removed \`${phrase}\` from wordlist\``)
            )
        } else if (args[1].toLowerCase() == "reset") {
            updateWords(message.guild, [])

            return message.channel.send(
                new CustomEmbed(message.member, false, "✅ wordlist has been reset")
            )
        } else if (args[1].toLowerCase() == "list") {
            const words = getWordList(message.guild)

            const embed = new CustomEmbed(message.member, false)

            if (words.length == 0) {
                embed.setDescription(
                    "using [default word list](https://gist.githubusercontent.com/tekoh/f8b8d6db6259cad221a679f5015d9f82/raw/b2dd03eb27da1daef362f0343a203617237c8ac8/chat-reactions.txt)"
                )
                embed.setTitle("chat reactions | " + message.author.username)
            } else {
                embed.setDescription(`\`${words.join("`\n`")}\``)
            }

            return message.channel.send(embed)
        }
    }
}

cmd.setRun(run)

module.exports = cmd
