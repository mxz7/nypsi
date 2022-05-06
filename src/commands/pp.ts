import { CommandInteraction, Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { getMember } from "../utils/functions/member"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { isPremium, getTier } from "../utils/premium/utils"

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("pp", "accurate prediction of your pp size", Categories.FUN).setAliases([
    "penis",
    "12inchmonster",
    "1inchwarrior",
])

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("how big is your willy"))

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

    if (isPremium(member.user.id)) {
        cacheTime = 25
    }

    let size
    let sizeMsg = "8"

    if (cache.has(member.user.id)) {
        size = cache.get(member.user.id)
    } else {
        size = Math.floor(Math.random() * 15)

        let chance = 45

        if (isPremium(member.user.id)) {
            if (getTier(member.user.id) >= 3) {
                chance = 10
            }
        }

        const bigInch = Math.floor(Math.random() * chance)

        if (bigInch == 7) {
            size = Math.floor(Math.random() * 55) + 15
        }

        cache.set(member.user.id, size)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    for (let i = 0; i < size; i++) {
        sizeMsg = sizeMsg + "="
    }

    sizeMsg = sizeMsg + "D"

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n${sizeMsg}\n📏 ${size} inches`
    ).setHeader("pp predictor 1337", member.user.avatarURL())

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
