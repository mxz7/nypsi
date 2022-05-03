import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { getDMsEnabled, setDMsEnabled, userExists, createUser } from "../utils/economy/utils.js"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"

const cmd = new Command("dms", "enable/disable dms with the bot", Categories.INFO).setAliases([
    "optout",
    "optin",
    "stopmessagingme",
])

const cooldown = new Map()

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 10 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 10000)

    if (!userExists(message.member)) createUser(message.member)

    const current = getDMsEnabled(message.member)

    let newValue
    let embed

    if (current) {
        newValue = false
        embed = new CustomEmbed(message.member, false, "✅ you will no longer receive dms from nypsi")
    } else {
        newValue = true
        embed = new CustomEmbed(message.member, false, "✅ you will now receive dms from nypsi")
    }

    setDMsEnabled(message.member, newValue)

    return await message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
