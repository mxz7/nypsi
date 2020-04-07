const { MessageEmbed } = require("discord.js")
const { getUserCount, getUserCountGuild, getColor } = require("../utils.js")

const cooldown = new Map()

module.exports = {
    name: "stats",
    description: "view stats for the bot",
    category: "info",
    run: async (message, args) => {

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
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        const { cmdCount, commandsSize, aliasesSize } = require("../nypsi.js")

        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setTitle("stats")
            .setColor(color)
            .setDescription("**server count** " + message.client.guilds.cache.size.toLocaleString() + "\n" + 
                "**users in memory** " + getUserCount() + "\n" +
                " -- **this server** " + getUserCountGuild(message.guild) + "\n" +
                "**total commands** " + commandsSize + "\n" +
                "**command aliases** " + aliasesSize + "\n" +
                "**commands used since restart** " + cmdCount.toLocaleString())
            .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

        message.channel.send(embed).catch(() => {
            return message.channel.send("❌\n i may be lacking permission: 'EMBED_LINKS'")
        })
    }
}