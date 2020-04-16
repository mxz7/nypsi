const { MessageEmbed } = require("discord.js")
const Discord = require("discord.js")
const { getColor } = require("../utils.js")

const cooldown = new Map()

const lockedChannels = new Set()

module.exports = {
    name: "softlock",
    description: "softlock a channel - make chat more readable when active",
    category: "moderation",
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_CHANNELS") || !message.member.hasPermission("MANAGE_ROLES")) {
            return 
        }

        if (!message.guild.me.hasPermission("MANAGE_CHANNELS") || !message.guild.me.hasPermission("MANAGE_ROLES")) {
            return message.channel.send("❌ i am lacking permission: 'MANAGE_CHANNELS' or 'MANAGE_ROLES'")
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
            return message.channel.send("❌ still on cooldown for " + remaining );
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
            if (b.includes("EMBED_LINKS") && b.includes("ATTACH_FILES")) {
                locked = true
            }
        }
        
        if (!locked) {
            await message.channel.updateOverwrite(role, {
                EMBED_LINKS: false,
                ATTACH_FILES: false
            })

            lockedChannels.add(message.channel.id)

            const embed = new MessageEmbed()
                .setTitle("lockdown | " + message.member.user.username)
                .setColor(color)
                .setDescription("✅ soft lock enabled for channel **" + message.channel.name + "**")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed)
        } else {
            await message.channel.updateOverwrite(role, {
                EMBED_LINKS: null,
                ATTACH_FILES: null
            })

            if (lockedChannels.has(message.channel.id)) {
                lockedChannels.delete(message.channel.id)
            }

            const embed = new MessageEmbed()
                .setTitle("lockdown | " + message.member.user.username)
                .setColor(color)
                .setDescription("✅ soft lock disabled for channel **" + message.channel.name + "**")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed)
        }

    },
    
    isLocked: function(channelID) {
        if (lockedChannels.has(channelID)) {
            return true
        } else {
            return false
        }
    }
}