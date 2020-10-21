const { Message } = require("discord.js");;
const fetch = require("node-fetch");
const { getPrefix } = require("../guilds/utils");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js");
const { getTimestamp, formatDate } = require("../utils/utils");

const cooldown = new Map()
const cache = new Map()
const serverCache = new Map()

const cmd = new Command("minecraft", "view information about a minecraft account", categories.INFO).setAliases(["mc"])

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

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed(`${prefix}minecraft <name/server IP>`));
    }

    cooldown.set(message.member.id, new Date());

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 5000);

    if (args[0] == "-cache") {
        if (cache.size > 100) {
            return message.channel.send("more than 100 items in cache")
        } else {
            const names = cache.keys()
            const names1 = []

            for (n of names) {
                names1.push(n)
            }

            const embed = new CustomEmbed(message.member, false, "`" + names1.join("`\n`") + "`").setTitle("minecraft cache")
            return message.channel.send(embed)
        }
    }

    if (args[0].includes(".")) {
        const serverIP = args[0]
        const url = "https://api.mcsrvstat.us/2/" + serverIP.toLowerCase()
        let res
        let invalid = false

        if (serverCache.has(serverIP.toLowerCase())) {
            res = serverCache.get(serverIP.toLowerCase())
        } else {
            res = await fetch(url).then(url => url.json()).catch(() => {
                invalid = true
            })
            if (!invalid) {
                serverCache.set(serverIP.toLowerCase(), res)
                setTimeout(() => {
                    serverCache.delete(serverIP.toLowerCase())
                }, 600000)
            } else {
                return message.channel.send(new ErrorEmbed("invalid server"))
            }
        }

        const embed = new CustomEmbed(message.member, true)
            .setTitle(args[0] + " | " + res.ip + ":" + res.port)
            .addField("players", res.players.online.toLocaleString() + "/" + res.players.max.toLocaleString(), true)
            .addField("version", res.version, true)
            .addField("motd", res.motd.clean)

        return message.channel.send(embed)
    }

    let username = args[0]

    let url1 = "https://mc-heads.net/minecraft/profile/" + username
    let url2 = "https://apimon.de/mcuser/" + username + "/old"
    let invalid = false
    let oldName = false
    let res
    let res2

    if (cache.has(username.toLowerCase())) {
        try {
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
        } catch {
            console.log(username)
            console.log(cache.get(username.toLowerCase()))
            cache.delete(username.toLowerCase())
            return await message.channel.send(new ErrorEmbed("error fetching from cache"))
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
                return message.channel.send(new ErrorEmbed("invalid account"))
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
            try {
                cache.delete(username.toLowerCase())
            } catch {
                cache.clear()
            }
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

    const skin = `https://mc-heads.net/avatar/${uuid}/256`

    const names = new Map()

    if (!nameHistory) {
        await message.channel.send(new ErrorEmbed("error fetching data"))
        console.log("error fetching data")
        console.log(res)
    }

    nameHistory.reverse()

    const BreakException = {}

    try {
        nameHistory.forEach(item => {

            if (item.timestamp) {
                const timestamp = formatDate(new Date(item.timestamp))

                value = "`" + item.name + "` | `" + timestamp + "`"
            } else if (item.changedToAt) {
                const timestamp = formatDate(new Date(item.changedToAt))

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

    const embed = new CustomEmbed(message.member, false, names.get(1).join("\n"))
        .setTitle(username)
        .setURL("https://namemc.com/profile/" + username)
        .setThumbnail(skin)

    if (oldName) {
        embed.setHeader("match found as an old username")
    }
    
    const msg = await message.channel.send(embed)

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
                    embed.setFooter("page " + currentPage + "/" + lastPage)
                    await msg.edit(embed)
                    return pageManager()
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager()
                } else {
                    currentPage++
                    embed.setDescription(names.get(currentPage).join("\n"))
                    embed.setFooter("page " + currentPage + "/" + lastPage)
                    await msg.edit(embed)
                    return pageManager()
                }
            }
        }
        return pageManager()
    }

}

setInterval(() => {
    if (cache.size > 7) {
        cache.clear()
        console.log(`[${getTimestamp()}] minecraft username cache cleared`)
    }
    if (serverCache.size > 7) {
        serverCache.clear()
        console.log(`[${getTimestamp()}] minecraft server cache cleared`)
    }
}, 6 * 60 * 60 * 1000);

cmd.setRun(run)

module.exports = cmd