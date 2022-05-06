import { CommandInteraction, Message } from "discord.js"
import { getMember } from "../utils/functions/member"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { isPremium } from "../utils/premium/utils"

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("boob", "accurate prediction of your boob size", Categories.FUN).setAliases(["howbigaremyboobies"])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how big are your boobies"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 7
    let cacheTime = 60

    if (isPremium(message.author.id)) {
        cooldownLength = 1
        cacheTime = 25
    }

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = cooldownLength - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, cooldownLength * 1000)

    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args[0])
        } else {
            member = message.mentions.members.first()
        }

        if (!member) {
            return send({ embeds: [new ErrorEmbed("invalid user")] })
        }
    }

    if (isPremium(member.user.id)) {
        cacheTime = 25
    }

    const letters = ["AA", "A", "B", "C", "D", "DD"]

    let sizeMsg = ""
    let sizeEmoji = ""

    if (cache.has(member.user.id)) {
        sizeMsg = cache.get(member.user.id).msg
        sizeEmoji = cache.get(member.user.id).emoji
    } else {
        const size = Math.floor(Math.random() * 9) * 2 + 30

        const index = Math.floor(Math.random() * letters.length)

        const letter = letters[index]

        if (index > 4) {
            sizeEmoji = "🍈"
        } else if (index > 2) {
            sizeEmoji = "🍒"
        } else {
            sizeEmoji = "🥞"
        }

        sizeMsg = `${size}${letter}`

        cache.set(member.user.id, {
            msg: sizeMsg,
            emoji: sizeEmoji,
        })

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    const embed = new CustomEmbed(message.member, false)
        .setHeader("boob calculator", member.user.avatarURL())
        .setDescription(member.user.toString() + `\n${sizeMsg}\n${sizeEmoji}`)

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
