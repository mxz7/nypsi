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
} = require("../chatreactions/utils")
const { getPrefix } = require("../guilds/utils")
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
    let cooldownLength = 15

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

    const helpCmd = () => {
        const embed = new CustomEmbed(message.member, true).setTitle(
            "chat reactions | " + message.author.username
        )
        const prefix = getPrefix(message.guild)

        embed.setDescription(
            `${prefix}**cr start** *start a random chat reaction*\n` +
                `${prefix}**cr settings** *view/modify the chat reaction settings for your server*\n` +
                `${prefix}**cr words** *view/modify the chat reaction word list*\n` +
                `${prefix}**cr blacklist** *add/remove people to the blacklist*\n` +
                `${prefix}**cr deleteall** *delete all chat reaction data*\n` +
                `${prefix}**cr stats** *view the chat reaction stats for this server*`
        )

        return message.channel.send(embed)
    }

    const showStats = async () => {
        cooldown.set(message.member.id, new Date())

        setTimeout(() => {
            cooldown.delete(message.author.id)
        }, cooldownLength * 1000)

        const embed = new CustomEmbed(message.member, false).setTitle(
            "chat reactions | " + message.author.username
        )

        const stats = getReactionStats(message.guild, message.member)

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

        embed.addField(
            "your stats",
            `first place **${stats.wins}**\nsecond place **${stats.secondPlace}**\nthird place **${stats.thirdPlace}**`
        )

        return message.channel.send(embed)
    }

    if (!message.member.hasPermission("MANAGE_MESSAGES")) return showStats()

    if (args.length == 0) {
        return helpCmd()
    } else if (args[0].toLowerCase() == "start") {
        if (!message.member.hasPermission("MANAGE_MESSAGES")) return

        const a = await startReaction(message.guild, message.channel)

        if (a == "xoxo69") {
            return message.channel.send(
                new ErrorEmbed("there is already a chat reaction in this channel")
            )
        }
    } else if (args[0].toLowerCase() == "stats") {
        return showStats()
    }
}

cmd.setRun(run)

module.exports = cmd
