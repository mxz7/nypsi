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
            return message.channel.send("❌ i am lacking permission: 'EMBED_LINKS'");
        }

        if (args.length == 0) {
            return message.channel.send("❌ $minecraft <name>");
        }

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
            return message.channel.send("❌ still on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 5000);

        let username = args[0]

        let url1 = "https://mc-heads.net/minecraft/profile/" + username
        let url2 = "https://apimon.de/mcuser/" + username + "/old"
        let invalid = false
        let oldName = false
        let res
        let res2

        res = await fetch(url1).then(url => url.json()).catch(() => {
            invalid = true
        })
        
        if (invalid) {
            res2 = await fetch(url2).then(url => {
                oldName = true
                invalid = false
                return url.json()
            }).catch(() => {
                invalid = true
                return message.channel.send("❌ invalid account")
            })
        }

        if (invalid) return

        let uuid
        let nameHistory

        if (oldName) {
            uuid = res2.id
            nameHistory = res2.history
            username = res2.name
        } else {
            uuid = res.id
            username = res.name
            nameHistory = res.name_history
        }

        const skin = `https://mc-heads.net/avatar/${uuid}`

        const names = []

        nameHistory.reverse()

        const BreakException = {}

        try {
            nameHistory.forEach(item => {
                if (names.join().length >= 800) {
                    names.push(`view more at [namemc](https://namemc.com/profile/${username})`)
                    throw BreakException
                }

                if (oldName) {
                    if (item.timestamp) {
                        const date = new Date(item.timestamp)
        
                        const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sept", "oct", "nov", "dec"]
            
                        const year = date.getFullYear()
                        const month = months[date.getMonth()]
                        const day = date.getDate()
            
                        const timestamp = month + " " + day + " " + year
            
                        names.push("`" + item.name + "` **|** `" + timestamp + "`")
                    } else {
                        names.push("`" + item.name + "`")
                    }
                } else {
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

        if (oldName) {
            embed.setAuthor("match found as an old username")
        }
        
        return message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        })
    }
}