const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")

const cooldown = new Map()
const reacted = new Map()

const cmd = new Command("f", "pay your respects", categories.FUN)

/**
 * 
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {
    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr - init) / 1000)
        const time = 30 - diff

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

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed("you need to pay respects to something"))
    }

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 30000)

    let content = args.join(" ")

    if (content.split("\n").length > 2) {
        content = content.split("\n").join(".")
    }

    if (content.length > 50) {
        content = content.substr(0, 50)
    }

    const embed = new CustomEmbed(message.member, false, `press **F** to pay your respects to **${content}**`)

    const msg = await message.channel.send(embed)

    await msg.react("🇫")

    reacted.set(msg.id, [])

    const filter = (reaction, user) => {
        if (reaction.emoji.name == "🇫" && !reacted.get(msg.id).includes(user.id)) {
            reacted.get(msg.id).push(user.id)
            return message.channel.send(new CustomEmbed(message.member, false, `${user.toString()} has paid respects to **${args.join(" ")}**`))
        }
    }
    
    let finished = false

    async function getReactions() {
        await msg.awaitReactions(filter, {max: 1, time:15000, errors:["time"]}).catch(async () => {
            finished = true
            await message.channel.send(new CustomEmbed(message.member, false, `**${reacted.get(msg.id).length.toLocaleString()}** people paid their respects to **${content}**`))
            return reacted.delete(msg.id)
        })
        if (!finished) {
            return getReactions()
        }
    }
    
    return getReactions()
}

cmd.setRun(run)

module.exports = cmd