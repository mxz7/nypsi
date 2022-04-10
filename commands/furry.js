const { Message } = require("discord.js")
const { updateXp, getXp, userExists, createUser } = require("../utils/economy/utils.js")
const { isPremium } = require("../utils/premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { getMember } = require("../utils/utils")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("furry", "measure how much of a furry you are", categories.FUN).setAliases(["howfurry", "stfufurry"])

cmd.slashEnabled = true
cmd.slashData.addUserOption(option => option.setName("user").setDescription("is this dude a furry"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let cooldownLength = 7
    let cacheTime = 60

    if (isPremium(message.author.id)) {
        cooldownLength = 1
    }

    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
        }
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

    if (!userExists(member)) createUser(member)

    if (isPremium(member.user.id)) {
        cacheTime = 25
    }

    let furryAmount

    if (cache.has(member.user.id)) {
        furryAmount = cache.get(member.user.id)
    } else {
        furryAmount = Math.ceil(Math.random() * 101) - 1

        cache.set(member.user.id, furryAmount)

        setTimeout(() => {
            if (cache.has(member.user.id)) {
                cache.delete(member.user.id)
            }
        }, cacheTime * 1000)
    }

    let furryText = ""
    let furryEmoji = ""

    if (furryAmount >= 85) {
        furryEmoji = "🐶🍆💦🧎‍♂️😋"
        furryText = "fucking cumfurry bet u work at a doggy daycare"
    } else if (furryAmount >= 70) {
        furryEmoji = "🐱🍆💦💦"
        furryText = "you've got a furry suit collection and go to cosplay conventions"
    } else if (furryAmount >= 50) {
        furryEmoji = "👉🐈💦"
        furryText = "stop looking at the cat"
    } else if (furryAmount >= 30) {
        furryEmoji = "💻🐕🐩"
        furryText = "i've seen your search history..."
    } else if (furryAmount >= 25) {
        furryEmoji = "😾"
        furryText = "STOP DONT DO IT DONT BUY THE FURRY SUIT"
    } else if (furryAmount >= 15) {
        furryEmoji = "🐈🐕"
        furryText = "you be thinking about the wrong things"
    } else if (furryAmount >= 7) {
        furryEmoji = "👍⁉"
        furryText = "you're normal. i hope."
    } else {
        furryEmoji = "👍"
        furryText = "you're normal, thank you. have 1 xp"

        if (cache.has(member.user.id)) {
            cache.delete(member.user.id)
            updateXp(member, getXp(member) + 1)
        }
    }

    const embed = new CustomEmbed(
        message.member,
        false,
        `${member.user.toString()}\n**${furryAmount}**% furry ${furryEmoji}\n${furryText}`
    ).setTitle("furry detector 5000")

    if (furryAmount < 7) {
        embed.setFooter("+1xp")
    }

    return await send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
