const { MessageEmbed } = require("discord.js");
const fetch = require("node-fetch");
const { getColor } = require("../utils.js")

const cooldown = new Map()

module.exports = {
    name: "minecraft",
    description: "view information about a minecraft account",
    category: "info",
    run: async (message, args) => {

        if (!message.guild.me.hasPermission("EMBED_LINKS")) {
            return message.channel.send("❌ \ni am lacking permission: 'EMBED_LINKS'");
        }

        if (args.length == 0) {
            return message.channel.send("❌\n$minecraft <name>");
        }

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
        }, 2000);

        let username = args[0]

        const url = `https://mc-heads.net/minecraft/profile/${username}`
        let invalid = false

        const res = await fetch(url).then(url => url.json()).catch(() => {
            invalid = true
            return message.channel.send("❌\ninvalid account")
        })
        
        if (invalid) return

        const uuid = res.id
        username = res.name
        const nameHistory = res.name_history

        const skin = `https://mc-heads.net/avatar/${uuid}/64`

        const names = []

        nameHistory.reverse()

        const BreakException = {}

        try {
            nameHistory.forEach(item => {
                if (names.join().length >= 800) {
                    names.push(`view more at [namemc](https://namemc.com/profile/${username})`)
                    throw BreakException
                }
    
                if (item.changedToAt) {
                    const date = new Date(item.changedToAt)
    
                    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sept", "oct", "nov", "dec"]
        
                    const year = date.getFullYear()
                    const month = months[date.getMonth()]
                    const day = date.getDate()
        
                    const timestamp = month + " " + day + " " + year
        
                    names.push("`" + item.name + "` **|** `" + timestamp + "`")
                } else {
                    names.push("`" + item.name + "`")
                }
            });
        } catch (e) {
            if (e != BreakException) throw e
        }
        
        const color = getColor(message.member);

        const embed = new MessageEmbed()
            .setTitle(username)
            .setURL("https://namemc.com/profile/" + username)
            .setDescription(`[skin](https://mc-heads.net/download/${uuid})`)
            .setColor(color)
            .setThumbnail(skin)
            .addField("previous names", names)
            .setFooter("bot.tekoh.wtf")
        
        return message.channel.send(embed).catch(() => {
            return message.channel.send("❌ \ni may be lacking permission: 'EMBED_LINKS'");
        })
    }
}