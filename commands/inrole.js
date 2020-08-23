const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils");
const { inCooldown, addCooldown } = require("../guilds/utils");

const cooldown = new Map()

module.exports = {
    name: "inrole",
    description: "get the members in a role",
    category: "info",
    run: async (message, args) => {

        const color = getColor(message.member);

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
            return message.channel.send(new MessageEmbed().setDescription("❌ still on cooldown for " + remaining).setColor(color));
        }

        if (args.length == 0) {
            return message.channel.send("❌ $inrole <role>")
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
            return message.channel.send("❌ couldn't find the role `" + args.join(" ") + "`")
        }

        

        role = role

        let members

        if (inCooldown(message.guild) || message.guild.memberCount == message.guild.members.cache.size) {
            members = message.guild.members.cache
        } else {
            members = await message.guild.members.fetch()

            addCooldown(message.guild, 3600)
        }

        const memberList = []

        await members.forEach(m => {
            if (m.roles.cache.has(role.id)) {
                memberList.push(m.user.tag)
            }
        })

        const embed = new MessageEmbed()
            .setTitle(role.name + " [" + memberList.length + "]")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        if (memberList.length > 75) {
            embed.setDescription("❌ too many members to list [" + memberList.length + "]")
        } else {
            embed.setDescription("`" + memberList.join("`\n`") + "`")
        }

        return await message.channel.send(embed)
    }
}