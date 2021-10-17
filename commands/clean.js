const { getPrefix } = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed } = require("../utils/classes/EmbedBuilders.js")
const { Permissions } = require("discord.js")

const cooldown = new Map()

const cmd = new Command("clean", "clean up bot commands and responses", categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return

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

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 15000)

    const prefix = getPrefix(message.guild)

    const collected = await message.channel.messages.fetch({ limit: 50 })

    const collecteda = collected.filter((msg) => msg.author.id == message.client.user.id || msg.content.startsWith(prefix))

    await message.channel.bulkDelete(collecteda)
}

cmd.setRun(run)

module.exports = cmd
