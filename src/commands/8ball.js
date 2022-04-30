const { Message } = require("discord.js")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { CustomEmbed, ErrorEmbed } = require("../utils/classes/EmbedBuilders.js")

const answers = [
    "as i see it, yes",
    "ask again later",
    "better not tell you now",
    "cannot predict now",
    "concentrate and ask again",
    "don't count on it",
    "it is certain",
    "it is decidedly so",
    "most likely",
    "my reply is no",
    "my sources say no",
    "outlook not so good",
    "outlook good",
    "reply hazy, try again",
    "signs point to yes",
    "very doubtful",
    "without a doubt",
    "yes.",
    "yes - definitely",
    "you may rely on it",
]

const cooldown = new Map()

const cmd = new Command("8ball", "ask the 8ball a question", categories.FUN)

/**
 *
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

        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must ask the 8ball something")] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    const question = args.join(" ")

    const embed = new CustomEmbed(
        message.member,
        false,
        `**${question}** - ${message.member.user.toString()}\n\n🎱 ${answers[Math.floor(Math.random() * answers.length)]}`
    )

    message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
