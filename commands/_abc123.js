const { MessageEmbed } = require("discord.js")
const { formatDate } = require("../utils/utils.js")
const { getPeaks } = require("../guilds/utils.js")
const { getBalance, userExists, getVoteMulti, topAmount, topAmountGlobal, getBankBalance, getMaxBankBalance, getXp } = require("../economy/utils.js")

module.exports = {
    name: "_abc123",
    description: "classified",
    category: "none",
    permissions: ["bot owner"],
    run: async (message, args) => {
        if (message.member.user.id != "672793821850894347") return

        if (args.length == 0) return

        if (args[0] == "id") {
            if (args.length == 1) return
            
            const users = message.client.users.cache
            const guilds = message.client.guilds.cache

            let user = users.find(u => u.id == args[1])
            if (!user) {
                return message.react("❌")
            }

            console.log(user)

            let guildNames = ""

            guilds.forEach(g => {
                const abc = g.members.cache.find(u => u.id == args[1])

                if (abc) {
                    guildNames = guildNames + "`" + g.id + "` "
                    user = abc
                }
            })

            const embed = new MessageEmbed()
                .setTitle(user.user.tag)
                .setColor("#60d16b")
                .setDescription("`" + user.id + "`")
                .setThumbnail(user.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))
                .addField("user info", "**tag** " + user.user.tag + "\n" +
                    "**created** " + formatDate(user.user.createdAt), true)
                .setFooter("bot.tekoh.wtf")

            if (userExists(user)) {
                let voted = false
                if (await getVoteMulti(user) > 0) voted = true
                embed.addField("economy", "💰 $**" + getBalance(user).toLocaleString() + "**\n" +
                    "💳 $**" + getBankBalance(user).toLocaleString() + "** / **" + getMaxBankBalance(user).toLocaleString() + "**\n" +
                    "**xp** " + getXp(user) + "\n" +
                    "**voted** " + voted, true)
            }
            
            embed.addField("guilds", guildNames)
            
            message.channel.send(embed)
        } else if (args[0] == "tag") {
            if (args.length == 1) return

            const users = message.client.users.cache
            const guilds = message.client.guilds.cache

            let user = users.find(u => (u.username + "#" + u.discriminator).toLowerCase().includes(args[1]))

            if (!user) {
                return message.react("❌")
            }

            console.log(user)

            let guildNames = ""

            guilds.forEach(g => {
                const abc = g.members.cache.find(u => u.user.tag.toLowerCase().includes(args[1]))

                if (abc) {
                    guildNames = guildNames + "`" + g.id + "` "
                    user = abc
                }
            })

            const embed = new MessageEmbed()
                .setTitle(user.user.tag)
                .setColor("#60d16b")
                .setDescription("`" + user.id + "`")
                .setThumbnail(user.user.displayAvatarURL({ format: "png", dynamic: true, size: 128 }))
                .addField("user info", "**tag** " + user.user.tag + "\n" +
                    "**created** " + formatDate(user.user.createdAt), true)
                .setFooter("bot.tekoh.wtf")

            if (userExists(user)) {
                let voted = false
                if (await getVoteMulti(user) > 0) voted = true
                embed.addField("economy", "💰 $**" + getBalance(user).toLocaleString() + "**\n" +
                    "💳 $**" + getBankBalance(user).toLocaleString() + "** / **" + getMaxBankBalance(user).toLocaleString() + "**\n" +
                    "**xp** " + getXp(user) + "\n" +
                    "**voted** " + voted, true)
            }
            
            embed.addField("guilds", guildNames)
            
            message.channel.send(embed)
        } else if (args[0] == "gid") {
            if (args.length == 1) return

            const guild = message.client.guilds.cache.find(g => g.id == args[1])

            if (!guild) {
                return message.react("❌")
            }

            if (args.join("").includes("-m")) {
                const members = guild.members.cache

                const names = new Map()

                members.forEach(m => {
                    if (names.size == 0) {
                        const value1 = []
                        value1.push("`" + m.user.tag + "`")
                        names.set(1, value1)
                    } else {
                        const lastPage = names.size
    
                        if (names.get(lastPage).length >= 10) {
                            const value1 = []
                            value1.push("`" + m.user.tag + "`")
                            names.set(lastPage + 1, value1)
                        } else {
                            names.get(lastPage).push("`" + m.user.tag + "`")
                        }
                    }
                })


                
                const embed = new MessageEmbed()
                    .setTitle(guild.name)
                    .setDescription(names.get(1).join("\n"))
                    .setFooter("bot.tekoh.wtf")
                    .setColor("#60d16b")
                
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
                                embed.setFooter("page " + currentPage)
                                await msg.edit(embed)
                                return pageManager()
                            }
                        } else if (reaction == "➡") {
                            if (currentPage >= lastPage) {
                                return pageManager()
                            } else {
                                currentPage++
                                embed.setDescription(names.get(currentPage).join("\n"))
                                embed.setFooter("page " + currentPage)
                                await msg.edit(embed)
                                return pageManager()
                            }
                        }
                    }
                    return pageManager()
                }
                return
            }

            const msg = await guildInfo(guild)

            message.channel.send(msg) 
        } else if (args[0] == "gname") {
            if (args.length == 1) return

            args.shift()

            const guild = message.client.guilds.cache.find(g => g.name.toLowerCase().includes(args.join(" ").replace("-m", "")))

            if (!guild) {
                return message.react("❌")
            }

            if (args.join("").includes("-m")) {
                const members = guild.members.cache

                const names = new Map()

                members.forEach(m => {
                    if (names.size == 0) {
                        const value1 = []
                        value1.push("`" + m.user.tag + "`")
                        names.set(1, value1)
                    } else {
                        const lastPage = names.size
    
                        if (names.get(lastPage).length >= 10) {
                            const value1 = []
                            value1.push("`" + m.user.tag + "`")
                            names.set(lastPage + 1, value1)
                        } else {
                            names.get(lastPage).push("`" + m.user.tag + "`")
                        }
                    }
                })


                
                const embed = new MessageEmbed()
                    .setTitle(guild.name)
                    .setDescription(names.get(1).join("\n"))
                    .setFooter("bot.tekoh.wtf")
                    .setColor("#60d16b")
                
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
                                embed.setFooter("page " + currentPage)
                                await msg.edit(embed)
                                return pageManager()
                            }
                        } else if (reaction == "➡") {
                            if (currentPage >= lastPage) {
                                return pageManager()
                            } else {
                                currentPage++
                                embed.setDescription(names.get(currentPage).join("\n"))
                                embed.setFooter("page " + currentPage)
                                await msg.edit(embed)
                                return pageManager()
                            }
                        }
                    }
                    return pageManager()
                }
                return
            }

            const msg = await guildInfo(guild)

            message.channel.send(msg)            
        } else if (args[0] == "top") {

            let amount = 5

            if (args.length > 1 && parseInt(args[1])) {
                amount = parseInt(args[1])
            }

            const balTop = topAmountGlobal(amount)

            const filtered = balTop.filter(function (el) {
                return el != null;
            });

            const embed = new MessageEmbed()
                .setTitle("top " + filtered.length)
                .setColor("#60d16b")
                .setDescription(filtered)
                .setFooter("bot.tekoh.wtf")

            message.channel.send(embed)
        }
    }
}

async function guildInfo(guild) {
    const members = guild.members.cache
    const users = members.filter(member => !member.user.bot)
    const bots = members.filter(member => member.user.bot)
    const online = users.filter(member => member.presence.status != "offline")

    const balTop = await topAmount(guild, 5)

    const filtered = balTop.filter(function (el) {
        return el != null;
    });

    let owner

    try {
        owner = guild.owner.user.tag
    } catch (e) {
        owner = "`" + guild.ownerID + "`"
    }

    let invites

    try {
        invites = (await guild.fetchInvites().catch()).keyArray()
    } catch {}

    const embed = new MessageEmbed()
        .setTitle(guild.name)
        .setColor("#60d16b")
        .setThumbnail(guild.iconURL({format: "png", dynamic: true, size: 128}))
        .setDescription("`" + guild.id + "`")
        .addField("info", "**owner** " + owner + "\n" + 
            "**created** " + formatDate(guild.createdAt) + "\n" +
            "**region** " + guild.region, true)
        .addField("info", "**roles** " + guild.roles.cache.size + "\n" + 
            "**channels** " + guild.channels.cache.size, true)
        .addField("member info", "**humans** " + users.size.toLocaleString() + "\n" +
            "**bots** " + bots.size.toLocaleString() + "\n" + 
            "**online** " + online.size.toLocaleString() + "\n" +
            "**member peak** " + getPeaks(guild).members.toLocaleString() + "\n" + 
            "**online peak** " + getPeaks(guild).onlines.toLocaleString(), true)
        .setFooter("bot.tekoh.wtf")

    if (invites && invites.length > 0) {
        embed.addField("invite (" + invites.length + ")", invites[Math.floor(Math.random() * invites.length)], true)
    }

    if (filtered.length > 0) {
        embed.addField("top " + filtered.length, filtered, true)
    }

    return embed
}