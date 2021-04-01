const { Message } = require("discord.js")
let wholesome = require("../lists.json").wholesome
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("wholesome", "get a random wholesome picture", categories.FUN)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7

    if (isPremium(message.author.id)) {
        cooldownLength = 1
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

    if (args.length == 1 && args[0] == "refresh") {
        if (message.author.id != "672793821850894347") return

        reload()

        return message.channel.send(
            new CustomEmbed(
                message.member,
                false,
                `✅ wholesome images reloaded\nsize: ${wholesome.length}`
            )
        )
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const imageNumber = Math.floor(Math.random() * wholesome.length)

    const embed = new CustomEmbed(message.member).embed
        .setAuthor(`<3 | #${imageNumber}`)
        .setImage(wholesome[imageNumber])

    message.channel.send(embed)
}

cmd.setRun(run)

module.exports = cmd

function reload() {
    delete require.cache[require.resolve("../lists.json")]
    wholesome = require("../lists.json").wholesome
}
