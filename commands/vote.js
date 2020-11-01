const { Message } = require("discord.js")
const { hasVoted, getBalance, updateBalance, userExists, createUser, removeFromVoteCache, getPrestige, getMulti } = require("../economy/utils.js")
const { getPrefix } = require("../guilds/utils.js")
const { Command, categories } = require("../utils/classes/Command.js")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()
const bonusCooldown = new Map()

const cmd = new Command("vote", "vote every 12 hours to get an extra 15% bonus on gambling wins as well as a money reward", categories.MONEY)

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
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    if (!userExists(message.member)) createUser(message.member)

    cooldown.set(message.member.id, new Date())

    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 5000)

    const prefix = getPrefix(message.guild)
    const amount = 15000 * (getPrestige(message.member) + 1)
    const voted = await hasVoted(message.member)
    const multi = await getMulti(message.member) * 100

    const embed = new CustomEmbed(message.member, true, "https://top.gg/bot/678711738845102087/vote")
        .setURL("https://top.gg/bot/678711738845102087/vote")
        .setFooter("you get increased rewards for prestiging")

    if (voted) {
        embed.setTitle("vote ✅")
        embed.setColor("#5efb8f")
        embed.addField("rewards", `✓ +**15**% multiplier, total: **${multi}**%\n✓ **xp** gambling bonus\n✓ +$**50k** max bet`)
    } else {
        embed.setTitle("vote ❌")
        embed.setColor("#e4334f")
        embed.addField("rewards", `× +**15**% multiplier, current: **${multi}**%\n× **xp** gambling bonus\n× +$**50k** max bet\n× $**${amount.toLocaleString()}** reward`)
        embed.setFooter("you get increased rewards for prestiging")
        removeFromVoteCache(message.member)
    }

    message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd

function getUptime(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const daysms = ms % (24 * 60 * 60 * 1000)
    const hours = Math.floor((daysms) / (60*60*1000))
    const hoursms = ms % (60 * 60 * 1000)
    const minutes = Math.floor((hoursms) / (60 * 1000))
    const minutesms = ms % (60 * 1000)
    const sec = Math.floor((minutesms) / (1000))

    let output = ""

    if (days > 0) {
        output = output + days + "d "
    }

    if (hours > 0) {
        output = output + hours + "h "
    }

    if (minutes > 0) {
        output = output + minutes + "m "
    }

    if (sec > 0) {
        output = output + sec + "s"
    }

    return output
}