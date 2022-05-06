import { CommandInteraction, Message } from "discord.js"
import { isPremium } from "../utils/premium/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
import { getMember } from "../utils/functions/member"
import { updateBalance, getBalance, userExists, createUser } from "../utils/economy/utils"

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("hot", "measure how hot you are", Categories.FUN).setAliases(["howhot", "sexy"])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("hot or not"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    let cooldownLength = 7
    let cacheTime = 60

    if (isPremium(message.author.id)) {
        cooldownLength = 1
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

    if (!userExists(member)) createUser(member)

    if (isPremium(member.user.id)) {
        cacheTime = 25
    }

    let hotAmount

    if (cache.has(member.user.id)) {
        hotAmount = cache.get(member.user.id)
    } else {
        hotAmount = Math.ceil(Math.random() * 101) - 1

        cache.set(member.user.id, hotAmount)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    let hotText = ""
    let hotEmoji = ""

    if (hotAmount >= 95) {
        hotEmoji = "💰🍆💪😍😘"
        hotText =
            "HEY THERE what does it take to marry you. look. ill give you money. here. ive got big muscles too. im 6'2. please."

        if (cache.has(member.user.id)) {
            cache.delete(member.user.id)
            updateBalance(member, getBalance(member) + 1069)
        }
    } else if (hotAmount >= 80) {
        hotEmoji = "💍😍"
        hotText = "marry me wifey"
    } else if (hotAmount >= 60) {
        hotEmoji = "😳😏🥺"
        hotText = "hey there baby girl.. ahaha..."
    } else if (hotAmount >= 45) {
        hotEmoji = "😳😳🥺"
        hotText = "hey hey dam u kinda cute"
    } else if (hotAmount >= 35) {
        hotEmoji = "🥵"
        hotText = "whats ur sc"
    } else if (hotAmount >= 25) {
        hotEmoji = "🍆"
        hotText = "fuckable"
    } else if (hotAmount >= 15) {
        hotEmoji = "🤓"
        hotText = "nerd."
    } else {
        hotEmoji = "🙄"
        hotText = "ugly."
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n**${hotAmount}**% hot ${hotEmoji}\n${hotText}`
    ).setHeader("hotness calculator", member.user.avatarURL())

    if (hotAmount >= 95) {
        embed.setFooter("+$1,069")
    }

    return await send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
