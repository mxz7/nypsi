const { getColor, getMember } = require("../utils/utils")
const { MessageEmbed } = require("discord.js")
const { getCases, profileExists, createProfile } = require("../moderation/utils")

module.exports = {
    name: "history",
    description: "view punishment history for a given user",
    category: "moderation",
    aliases: ["modlogs"],
    permissions: ["MANAGE_MESSAGES"],
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) return

        const color = getColor(message.member)

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("history help")
                .setColor(color)
                .addField("usage", "$history @user\n$history <user ID or tag>")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed)
        }

        if (!profileExists(message.guild)) createProfile(message.guild)

        let member
        let unknownMember = false

        if (message.mentions.members.first()) {
            member = message.mentions.members.first()
        } else {
            const members = message.guild.members.cache

            if (args[0].length == 18) {
                member = members.find(m => m.user.id == args[0])

                if (!member) {
                    unknownMember = true
                    member = args[0]
                }
            } else {
                member = getMember(message, args[0])

                if (!member) {
                    return message.channel.send("❌ can't find `" + args[0] + "` - please use a user ID if they are no longer in the server")
                }
            }
        }

        let cases
        let pages = []

        if (!unknownMember) {
            cases = getCases(message.guild, member.user.id)
        } else {
            cases = getCases(message.guild, member)
        }

        if (cases.length == 0) {
            return message.channel.send("❌ no history to display")
        }

        let count = 0
        let page = []
        for (case0 of cases) {
            if (count == 5) {
                pages.push(page)
                page = []
                page.push(case0)
                count = 1
            } else {
                page.push(case0)
                count++
            }
        }

        if (count != 0) {
            pages.push(page)
        }

        const embed = new MessageEmbed()
            .setColor(color)
            .setFooter("page 1/" + pages.length + " | total: " + cases.length)
            
        if (unknownMember) {
            embed.setAuthor("history for " + member)
        } else {
            embed.setAuthor("history for " + member.user.tag)
        }

        for (case0 of pages[0]) {
            const date = new Date(case0.time)
            if (case0.deleted) {
                embed.addField("case " + case0.id, "`[deleted]`")
            } else {
                embed.addField("case " + case0.id, "`" + case0.type + "` - " + case0.command + "\nat " + date.toLocaleString())
            }
        }

        const msg = await message.channel.send(embed)

        if (pages.length > 1) {
            await msg.react("⬅")
            await msg.react("➡")

            let currentPage = 0

            const lastPage = pages.length

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

                const newEmbed = new MessageEmbed()
                    .setColor(color)
                    
                if (unknownMember) {
                    newEmbed.setAuthor("history for " + member)
                } else {
                    newEmbed.setAuthor("history for " + member.user.tag)
                }
                
                if (!reaction) return

                if (reaction == "⬅") {
                    if (currentPage <= 0) {
                        return pageManager()
                    } else {
                        currentPage--
                        for (case0 of pages[currentPage]) {
                            const date = new Date(case0.time)
                            if (case0.deleted) {
                                newEmbed.addField("case " + case0.id, "`[deleted]`")
                            } else {
                                newEmbed.addField("case " + case0.id, "`" + case0.type + "` - " + case0.command + "\nat " + date.toLocaleString())
                            }
                        }
                        newEmbed.setFooter("page " + (currentPage + 1) + "/" + pages.length + " | total: " + cases.length)
                        await msg.edit(newEmbed)
                        return pageManager()
                    }
                } else if (reaction == "➡") {
                    if ((currentPage + 1) >= lastPage) {
                        return pageManager()
                    } else {
                        currentPage++
                        for (case0 of pages[currentPage]) {
                            const date = new Date(case0.time)
                            if (case0.deleted) {
                                newEmbed.addField("case " + case0.id, "`[deleted]`")
                            } else {
                                newEmbed.addField("case " + case0.id, "`" + case0.type + "` - " + case0.command + "\nat " + date.toLocaleString())
                            }
                        }
                        newEmbed.setFooter("page " + (currentPage + 1) + "/" + pages.length + " | total: " + cases.length)
                        await msg.edit(newEmbed)
                        return pageManager()
                    }
                }
            }
            return pageManager()
        }

    }
}