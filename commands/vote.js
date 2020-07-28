const { MessageEmbed } = require("discord.js")
const { getVoteMulti, getBalance, updateBalance, userExists, createUser, removeFromVoteCache } = require("../economy/utils.js")

const cooldown = new Map()
const bonusCooldown = new Map()

module.exports = {
    name: "vote",
    description: "vote every 12 hours to get a 20% bonus on gambling wins as well as a $15k reward",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 10 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        if (!userExists(message.member)) createUser(message.member)

        const voted = await getVoteMulti(message.member) > 0

        const embed = new MessageEmbed()
        embed.setURL("https://top.gg/bot/678711738845102087/vote")
        embed.setDescription("https://top.gg/bot/678711738845102087/vote")
        embed.setFooter("bot.tekoh.wtf")

        if (voted) {

            if (!bonusCooldown.has(message.member.id)) {
                embed.setTitle("vote ✅ | " + message.member.user.username)
                embed.setColor("#5efb8f")
                embed.addField("status", "you currently have a 20% bonus on all gambling wins\nyou have been rewarded with $**15,000** for voting")
                updateBalance(message.member, getBalance(message.member) + 15000)
                bonusCooldown.set(message.member.id, new Date())
                setTimeout(() => {
                    try {
                        bonusCooldown.delete(message.member.user.id)
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
                embed.addField("status", "you currently have a 20% bonus on all gambling wins\nyou can receive a $**15,000** bonus in: " + remaining)
            }
        } else {
            embed.setTitle("vote ❌ | " + message.member.user.username)
            embed.setColor("#e4334f")
            embed.addField("status", "by voting you can gain a 20% bonus on all gambling wins as well as a $**15,000** reward")
            removeFromVoteCache(message.member)
        }

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        })

    }
}

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