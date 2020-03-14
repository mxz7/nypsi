const { RichEmbed } = require("discord.js")
const { getVoteMulti } = require("../utils.js")

const cooldown = new Map()

module.exports = {
    name: "vote",
    description: "vote every 12 hours to get a 5% bonus on gambling wins",
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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        const voted = await getVoteMulti(message.member) > 0

        const embed = new RichEmbed()
        embed.setURL("https://top.gg/bot/678711738845102087/vote")
        embed.setDescription("https://top.gg/bot/678711738845102087/vote")
        embed.setFooter(message.member.user.tag + " | bot.tekoh.wtf", message.member.user.avatarURL)
        embed.setTimestamp();

        if (voted) {
            embed.setTitle("vote ✅")
            embed.setColor("#31E862")
            embed.addField("status", "you currently have a 10% bonus on gambling wins")
        } else {
            embed.setTitle("vote ❌")
            embed.setColor("#FF0000")
            embed.addField("status", "by voting you can gain a 10% bonus on gambling wins\n" +  
                "this process will be done in the background")
        }

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        })

    }
}