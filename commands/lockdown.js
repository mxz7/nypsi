const { MessageEmbed } = require("discord.js")
const Discord = require("discord.js")
const { getColor } = require("../utils.js")

const cooldown = new Map()

module.exports = {
    name: "lockdown",
    description: "lockdown a channel (will only work if permissions are setup correctly)",
    category: "moderation",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_CHANNELS") || !message.member.hasPermission("MANAGE_ROLES")) {
            return 
        }

        if (!message.guild.me.hasPermission("MANAGE_CHANNELS") || !message.guild.me.hasPermission("MANAGE_ROLES")) {
            return message.channel.send("❌\ni am lacking permission: 'MANAGE_CHANNELS' or 'MANAGE_ROLES'")
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 3 - diff

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
        }, 3000);

        const color = getColor(message.member);

        let locked = false

        const role = message.guild.roles.cache.find(role => role.name == "@everyone")

        const a = message.channel.permissionOverwrites.get(role.id)

        if (!a) {
            locked = false
        } else if (!a.deny) {
            locked = false
        } else if (!a.deny.bitfield) {
            locked = false
        } else {
            const b = new Discord.Permissions(a.deny.bitfield).toArray()
            if (b.includes("SEND_MESSAGES")) {
                locked = true
            }
        }
        
        if (!locked) {
            await message.channel.updateOverwrite(role, {
                SEND_MESSAGES: false
            })

            const embed = new MessageEmbed()
                .setTitle("lockdown")
                .setColor(color)
                .setDescription("✅ lockdown enabled for channel **" + message.channel.name + "**")
                .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

            return message.channel.send(embed)
        } else {
            await message.channel.updateOverwrite(role, {
                SEND_MESSAGES: null
            })
            const embed = new MessageEmbed()
                .setTitle("lockdown")
                .setColor(color)
                .setDescription("✅ lockdown disabled for channel **" + message.channel.name + "**")
                .setFooter(message.member.user.tag + " | bot.tekoh.wtf")

            return message.channel.send(embed)
        }

    }
}