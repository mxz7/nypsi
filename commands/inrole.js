const { Message } = require("discord.js");
const { inCooldown, addCooldown } = require("../guilds/utils");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("inrole", "get the members in a role", categories.INFO)

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

    if (args.length == 0) {
        return message.channel.send(new ErrorEmbed("$inrole <role>"))
    }

    const roles = message.guild.roles.cache

    let role 

    if (message.mentions.roles.first()) {
        role = message.mentions.roles.first()
    } else if (args[0].length == 18 && parseInt(args[0])) {
        role = roles.find(r => r.id == args[0])
    } else {
        role = roles.find(r => r.name.toLowerCase().includes(args.join(" ").toLowerCase()))
    }

    if (!role) {
        return message.channel.send(new ErrorEmbed(`couldn't find the role \`${args.join(" ")}\``))
    }

    role = role

    let members

    if (inCooldown(message.guild) || message.guild.memberCount == message.guild.members.cache.size || message.guild.memberCount <= 250) {
        members = message.guild.members.cache
    } else {
        members = await message.guild.members.fetch()

        addCooldown(message.guild, 3600)
    }

    const memberList = new Map()
    let count = 0

    await members.forEach(m => {
        if (m.roles.cache.has(role.id)) {
            count++
            if (memberList.size >= 1) {
                const currentPage = memberList.get(memberList.size)

                if (currentPage.length >= 10) {
                    const newPage = ["`" + m.user.tag + "`"]

                    memberList.set(memberList.size + 1, newPage)
                } else {
                    currentPage.push("`" + m.user.tag + "`")

                    memberList.set(memberList.size, currentPage)
                }
            } else {
                const newPage = ["`" + m.user.tag + "`"]

                memberList.set(1, newPage)
            }
        }
    })

    if (!memberList.get(1)) {
        return message.channel.send(new CustomEmbed(message.member, false, "that role has no members"))
    }

    const embed = new CustomEmbed(message.member, false, memberList.get(1))
        .setTitle(role.name + " [" + count.toLocaleString() + "]")
        .setFooter(`page 1/${memberList.size}`)
    

    const msg = await message.channel.send(embed)

    if (memberList.size <= 1) return

    await msg.react("⬅")
    await msg.react("➡")

    let currentPage = 1
    const lastPage = memberList.size

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
                embed.setDescription(memberList.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage}`)
                await msg.edit(embed)
                return pageManager()
            }
        } else if (reaction == "➡") {
            if (currentPage == lastPage) {
                return pageManager()
            } else {
                currentPage++
                embed.setDescription(memberList.get(currentPage).join("\n"))
                embed.setFooter(`page ${currentPage}/${lastPage}`)
                await msg.edit(embed)
                return pageManager()
            }
        }
    }
    return pageManager()

}

cmd.setRun(run)

module.exports = cmd