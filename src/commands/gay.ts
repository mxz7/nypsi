import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { getMember } from "../utils/utils"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { isPremium } from "../utils/premium/utils"

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("gay", "very accurate gay level calculator", Categories.FUN).setAliases(["howgay", "lgbtdetector"])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("are u gay"))

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

    let gayAmount

    if (cache.has(member.user.id)) {
        gayAmount = cache.get(member.user.id)
    } else {
        gayAmount = Math.ceil(Math.random() * 101) - 1

        cache.set(member.user.id, gayAmount)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    let gayText = ""
    let gayEmoji = ""

    if (gayAmount >= 70) {
        gayEmoji = ":rainbow_flag:"
        gayText = "dam hmu 😏"
    } else if (gayAmount >= 45) {
        gayEmoji = "🌈"
        gayText = "good enough 😉"
    } else if (gayAmount >= 20) {
        gayEmoji = "👫"
        gayText = "kinda straight 😐"
    } else {
        gayEmoji = "📏"
        gayText = "thought we coulda had smth 🙄"
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n**${gayAmount}**% gay ${gayEmoji}\n${gayText}`
    ).setTitle("gay calculator")

    return await send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
