const { MessageEmbed } = require("discord.js");
const fetch = require("node-fetch");
const { getColor } = require("../utils/utils")

const cooldown = new Map()
const cache = new Map()

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

        if (cache.has(username.toLowerCase())) {
            if (cache.get(username.toLowerCase()).invalid) {
                return message.channel.send("❌ invalid account")
            }
            if (cache.get(username.toLowerCase()).oldName) {
                res2 = cache.get(username.toLowerCase()).response
                oldName = true
                res2.history.reverse()
            } else {
                res = cache.get(username.toLowerCase()).response
                res.name_history.reverse()
            }
        } else {
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

            if (!oldName) {
                cache.set(username.toLowerCase(), {
                    invalid: invalid,
                    oldName: false,
                    response: res
                })
            } else {
                cache.set(username.toLowerCase(), {
                    invalid: invalid,
                    oldName: true,
                    response: res2
                })
            }

            setTimeout(() => {
                cache.delete(username)
            }, 600000)
    
            if (invalid) return
        }

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

        const names = new Map()

        nameHistory.reverse()

        const BreakException = {}

        try {
            nameHistory.forEach(item => {

                if (item.timestamp) {
                    const date = new Date(item.timestamp)

                    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sept", "oct", "nov", "dec"]
        
                    const year = date.getFullYear()
                    const month = months[date.getMonth()]
                    const day = date.getDate()
        
                    const timestamp = month + " " + day + " " + year

                    value = "`" + item.name + "` | `" + timestamp + "`"
                } else if (item.changedToAt) {
                    const date = new Date(item.changedToAt)

                    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sept", "oct", "nov", "dec"]
        
                    const year = date.getFullYear()
                    const month = months[date.getMonth()]
                    const day = date.getDate()
        
                    const timestamp = month + " " + day + " " + year

                    value = "`" + item.name + "` | `" + timestamp + "`"
                } else {
                    value = "`" + item.name + "`"
                }

                if (names.size == 0) {
                    const value1 = []
                    value1.push(value)
                    names.set(1, value1)
                } else {
                    const lastPage = names.size

                    if (names.get(lastPage).length >= 10) {
                        const value1 = []
                        value1.push(value)
                        names.set(lastPage + 1, value1)
                    } else {
                        names.get(lastPage).push(value)
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
            .setDescription(names.get(1).join("\n"))
            .setColor(color)
            .setThumbnail(skin)
            .setFooter("bot.tekoh.wtf")

        if (oldName) {
            embed.setAuthor("match found as an old username")
        }
        
        const msg = await message.channel.send(embed).catch(() => {
            return message.channel.send("❌ i may be lacking permission: 'EMBED_LINKS'");
        })

        if (names.size >= 2) {
            await msg.react("⬅")
            await msg.react("➡")

            let currentPage = 1
            const lastPage = names.size

            const filter = (reaction, user) => {
                return ["⬅", "➡"].includes(reaction.emoji.name) && user.id == message.member.user.id
            }

            async function pageManager() {
                const reaction = await msg.awaitReactions(filter, { max: 1, time: 30000, errors: ["time"] })
                    .then(collected => {
                        return collected.first().emoji.name
                    }).catch(async () => {
                        await msg.reactions.removeAll()
                    })
                
                if (!reaction) return
        
                if (reaction == "⬅") {
                    if (currentPage <= 1) {
                        return pageManager()
                    } else {
                        currentPage--
                        embed.setDescription(names.get(currentPage).join("\n"))
                        embed.setFooter("bot.tekoh.wtf | page " + currentPage + "/" + lastPage)
                        await msg.edit(embed)
                        return pageManager()
                    }
                } else if (reaction == "➡") {
                    if (currentPage >= lastPage) {
                        return pageManager()
                    } else {
                        currentPage++
                        embed.setDescription(names.get(currentPage).join("\n"))
                        embed.setFooter("bot.tekoh.wtf | page " + currentPage + "/" + lastPage)
                        await msg.edit(embed)
                        return pageManager()
                    }
                }
            }
            return pageManager()
        }
    }
}