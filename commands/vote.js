const { Message } = require("discord.js");
const { getVoteMulti, getBalance, updateBalance, userExists, createUser, removeFromVoteCache } = require("../economy/utils.js");
const { getPrefix } = require("../guilds/utils.js");
const { Command, categories } = require("../utils/classes/Command.js");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()
const bonusCooldown = new Map()

const cmd = new Command("vote", "vote every 12 hours to get a 20% bonus on gambling wins as well as a $15k reward", categories.MONEY)

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

    const prefix = getPrefix(message.guild)

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 5000);

    if (!userExists(message.member)) createUser(message.member)

    const voted = await getVoteMulti(message.member) > 0

    const embed = new CustomEmbed(message.member, true, "https://top.gg/bot/678711738845102087/vote")
        .setURL("https://top.gg/bot/678711738845102087/vote")

    if (voted) {

        if (!bonusCooldown.has(message.member.id)) {
            embed.setTitle("vote ✅ | " + message.member.user.username)
            embed.setColor("#5efb8f")
            embed.addField("rewards", "✓ **20**% gambling bonus\n✓ **xp** gambling bonus\n✓ $**15,000** added to your balance")
            embed.setFooter("you can claim another $15,000 in 6 hours")
            updateBalance(message.member, getBalance(message.member) + 15000)
            bonusCooldown.set(message.member.id, new Date())
            setTimeout(() => {
                try {
                    bonusCooldown.delete(message.author.id)
                } catch {}
            }, 21600000)
        } else {
            const init = bonusCooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init))
            const time = 21600000 - diff
            const remaining = getUptime(time)

            embed.setTitle("vote ✅ | " + message.member.user.username)
            embed.setColor("#5efb8f")
            embed.addField("rewards", "✓ **20**% gambling bonus\n✓ **xp** gambling bonus\n- $**15,000** available in: " + remaining)
        }
    } else {
        embed.setTitle("vote ❌ | " + message.member.user.username)
        embed.setColor("#e4334f")
        embed.addField("rewards", "× **20**% gambling bonus\n× **xp** gambling bonus\n× $**15,000** reward")
        embed.setFooter(`you must run ${prefix}vote to redeem $15,000`)
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