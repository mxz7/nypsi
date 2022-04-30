const { Message } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/models/EmbedBuilders")
const { getPrefix } = require("../utils/guilds/utils")
const { setLastfmUsername, getLastfmUsername } = require("../utils/users/utils")
const { cleanString } = require("../utils/utils")

const cmd = new Command("setlastfm", "set your last.fm username", categories.INFO).setAliases(["slfm"])

const cooldown = new Map()

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 30 - diff

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

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)

        const username = getLastfmUsername(message.member)

        if (username) {
            embed.setDescription(`your last.fm username is set to \`${username.username}\``)
        } else {
            embed.setDescription(`your username has not been set, ${getPrefix(message.guild)}**slfm <username>**`)
        }

        return message.channel.send({ embeds: [embed] })
    }

    const res = await setLastfmUsername(message.member, args[0])

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 30000)

    const embed = new CustomEmbed(message.member, false)

    if (res) {
        embed.setDescription(`your last.fm username has been set to \`${cleanString(args[0])}\``)
    } else {
        embed.setDescription(`\`${cleanString(args[0])}\` is not a valid last.fm username`)
    }

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
