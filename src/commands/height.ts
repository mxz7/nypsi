import { Message } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
const { getMember } = require("../utils/utils")
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { isPremium } from "../utils/premium/utils"

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("height", "accurate prediction of your height", Categories.FUN)

cmd.slashEnabled = true
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("i bet ur short"))

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
            member = await getMember(message, args[0])
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
    let feet
    let inches
    let sizeMsg

    if (cache.has(member.user.id)) {
        size = cache.get(member.user.id)
        feet = size.split("'")[0]
        inches = size.split("'")[1]
    } else {
        feet = Math.floor(Math.random() * 6) + 4
        inches = Math.floor(Math.random() * 12)

        if (feet > 6) feet = 5

        size = `${feet}'${inches}`

        cache.set(member.user.id, size)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, cacheTime * 1000)
    }

    if (feet == 6) {
        sizeMsg = "yo ur tall 😳"
    } else if (feet == 5) {
        if (inches <= 6) {
            sizeMsg = "kinda short.. 🤨"
        } else {
            sizeMsg = "average 🙄"
        }
    } else {
        sizeMsg = "LOOOL UR TINY LMAO 😂🤣😆 IMAGINE"
    }

    const embed = new CustomEmbed(message.member, false, `${member.user.toString()}\n\n📏 ${size}\n${sizeMsg}`).setTitle(
        "short person calculator"
    )

    return send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
