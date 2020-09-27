const { MessageEmbed, Message } = require("discord.js");
const Discord = require("discord.js")
const { getColor } = require("../utils/utils")

const cooldown = new Map()

module.exports = {
    name: "lockdown",
    description: "lockdown a channel (will only work if permissions are setup correctly)",
    category: "moderation",
    aliases: ["lock"],
    permissions: ["MANAGE_CHANNELS", "MANAGE_MESSAGES"],
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        const color = getColor(message.member);
        
        if (!message.member.hasPermission("MANAGE_CHANNELS") || !message.member.hasPermission("MANAGE_MESSAGES")) {
            if (message.member.hasPermission("MANAGE_MESSAGES")) {
                const embed = new MessageEmbed()
                    .setTitle("lockdown")
                    .setDescription("❌ requires permission: *MANAGE_CHANNELS* and *MANAGE_MESSAGES*")
                    .setFooter("bot.tekoh.wtf")
                    .setColor(color)
                return message.channel.send(embed)
            }
            return 
        }

        if (!message.guild.me.hasPermission("MANAGE_CHANNELS") || !message.guild.me.hasPermission("MANAGE_ROLES")) {
            return message.channel.send("❌ i am lacking permission: 'MANAGE_CHANNELS' or 'MANAGE_ROLES'")
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 2 - diff

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

        let channel = message.channel

        if (message.mentions.channels.first()) {
            channel = message.mentions.channels.first()
        }

        cooldown.set(message.member.id, new Date());
        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 1500);

        let locked = false

        const role = message.guild.roles.cache.find(role => role.name == "@everyone")

        const a = channel.permissionOverwrites.get(role.id)

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
            await channel.updateOverwrite(role, {
                SEND_MESSAGES: false
            })

            const embed = new MessageEmbed()
                .setTitle("lockdown | " + message.member.user.username)
                .setColor(color)
                .setDescription("✅ " + channel.toString() + " has been locked")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => {
                return message.member.send(embed).catch()
            })
        } else {
            await channel.updateOverwrite(role, {
                SEND_MESSAGES: null
            })
            const embed = new MessageEmbed()
                .setTitle("lockdown | " + message.member.user.username)
                .setColor(color)
                .setDescription("✅ " + channel.toString() + " has been unlocked")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed).catch(() => {
                return message.member.send(embed).catch()
            })
        }

    }
}