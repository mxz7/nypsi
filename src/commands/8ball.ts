import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders"
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler"

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

const cmd = new Command("8ball", "ask the 8ball a question", Categories.FUN)

/**
 *
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member)

        return message.channel.send({ embeds: [embed] })
    }

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must ask the 8ball something")] })
    }

    await addCooldown(cmd.name, message.member, 7)

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
