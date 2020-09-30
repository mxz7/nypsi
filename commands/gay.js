const { Message } = require("discord.js");
const { Command, categories } = require("../utils/classes/Command");
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cache = new Map()
const cooldown = new Map()

const cmd = new Command("gay", "very accurate gay level calculator", categories.FUN).setAliases(["howgay"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 5 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``));
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.member.id);
    }, 5000);

    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = getMember(message, args[0])
        } else {
            member = message.mentions.members.first()
        }

        if (!member) {
            return message.channel.send(new ErrorEmbed("invalid user"));
        }
    }

    let gayAmount

    if (cache.has(member.user.id)) {
        gayAmount = cache.get(member.user.id)
    } else {
        gayAmount = Math.ceil(Math.random() * 101) - 1

        cache.set(member.user.id, gayAmount)

        setTimeout(() => {
            cache.delete(member.user.id)
        }, 60000);
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

    const embed = new CustomEmbed(message.member, false, `${member.user.toString()}\n**${gayAmount}**% gay ${gayEmoji}\n${gayText}`)
        .setTitle("gay calculator")

    return await message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd