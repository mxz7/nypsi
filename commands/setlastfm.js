const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders")
const { setLastfmUsername, getLastfmUsername } = require("../utils/users/utils")

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
            embed.setDescription(`your last.fm username is set to \`${username}\``)
        } else {
            embed.setDescription("your username has not been set")
        }

        return message.channel.send({embeds: [embed]})
    }

    //await setLastfmUsername(message.member, args[0])
}

cmd.setRun(run)

module.exports = cmd