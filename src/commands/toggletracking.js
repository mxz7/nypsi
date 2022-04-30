const { Message } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders")
const { getPrefix } = require("../utils/guilds/utils")
const {
    isTracking,
    disableTracking,
    enableTracking,
    usernameProfileExists,
    createUsernameProfile,
} = require("../utils/users/utils")

const cmd = new Command("toggletracking", "toggle tracking your username and avatar changes", categories.INFO)

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 10 - diff

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

    if (!usernameProfileExists(message.member)) createUsernameProfile(message.member)

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10 * 1000)

    if (isTracking(message.author.id)) {
        disableTracking(message.author.id)
        return message.channel.send({
            embeds: [
                new CustomEmbed(message.member, false, "✅ username and avatar tracking has been disabled").setFooter(
                    `use ${getPrefix(message.guild)}(un/avh) -clear to clear your history`
                ),
            ],
        })
    } else {
        enableTracking(message.author.id)
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ username and avatar tracking has been enabled")],
        })
    }
}

cmd.setRun(run)

module.exports = cmd
