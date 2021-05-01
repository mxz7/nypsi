const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getStats, hasStatsProfile, createStatsProfile } = require("../utils/economy/utils")

const cmd = new Command("stats", "view your economy stats", categories.MONEY)

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 15 - diff

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

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 15000)

    if (!hasStatsProfile(message.member)) createStatsProfile(message.member)

    const normalStats = () => {
        const stats = getStats(message.member)

        let gambleWins = 0
        let gambleLoses = 0

        for (const gambleStats in stats.gamble) {
            gambleWins += stats.gamble[gambleStats].wins
            gambleLoses += stats.gamble[gambleStats].lose
        }

        const embed = new CustomEmbed(message.member, true).setTitle(
            "stats | " + message.author.username
        )

        embed.addField(
            "gamble",
            `**${gambleWins.toLocaleString()}** win${
                gambleWins == 1 ? "" : "s"
            }\n**${gambleLoses.toLocaleString()}** loss${gambleLoses == 1 ? "" : "es"}`,
            true
        )
        embed.addField(
            "rob",
            `**${stats.rob.wins.toLocaleString()}** win${
                stats.rob.wins == 1 ? "" : "s"
            }\n**${stats.rob.lose.toLocaleString()}** loss${stats.rob.lose == 1 ? "" : "es"}`,
            true
        )
        embed.addField(
            "padlock",
            `**${stats.padlock.toLocaleString()}** padlock${stats.padlock == 1 ? "" : "s"} used`,
            true
        )

        return message.channel.send(embed)
    }

    const gambleStats = () => {
        const stats = getStats(message.member).gamble

        const embed = new CustomEmbed(message.member, true).setTitle(
            "stats | " + message.author.username
        )

        for (const gambleStat in stats) {
            embed.addField(
                gambleStat,
                `**${stats[gambleStat].wins.toLocaleString()}** win${
                    stats[gambleStat].wins == 1 ? "" : "s"
                }\n**${stats[gambleStat].lose.toLocaleString()}** loss${
                    stats[gambleStat].lose == 1 ? "" : "es"
                }`,
                true
            )
        }

        return message.channel.send(embed)
    }

    if (args.length == 0) {
        return normalStats()
    } else if (args[0].toLowerCase() == "gamble") {
        return gambleStats()
    } else {
        return normalStats()
    }
}

cmd.setRun(run)

module.exports = cmd
