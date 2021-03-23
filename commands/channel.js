const { Message } = require("discord.js")
const { getPrefix } = require("../guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cooldown = new Map()

const cmd = new Command("channel", "create, delete and modify channels", categories.ADMIN).setAliases(["ch"]).setPermissions(["MANAGE_CHANNELS"])

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
        return message.channel.send(new ErrorEmbed(`still on cooldown for \`${remaining}\``))
    }

    if (!message.member.hasPermission("MANAGE_CHANNELS")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send(new ErrorEmbed("you need the `manage channels` permission"))
        }
        return
    }

    if (!message.guild.me.hasPermission("MANAGE_CHANNELS")) {
        return message.channel.send(new ErrorEmbed("i need the `manage channel` permission for this command to work"))
    }

    let fail = false

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("channel help")
            .addField("usage", `${prefix}channel create <name(s)>\n` +
                `${prefix}channel delete <#channel(s)>\n` +
                `${prefix}channel rename <#channel> <name>\n` +
                `${prefix}channel nsfw <#channel>`)
            .addField("help", "you can create/delete multiple channels at the same time, examples on this can be seen below")
            .addField("examples", `${prefix}channel create channel\n` +
                `${prefix}channel create channel1 channel2 channel3\n` +
                `${prefix}channel delete #channel1 #channel2 #channel3`)

        return message.channel.send(embed)
    }

    if (args[0] == "create" || args[0] == "c") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${prefix}channel **c**reate <name1 name2>\nexample: ${prefix}channel c channel1 channel2`))
        }
        args.shift()

        let channels = ""

        for (let arg of args) {
            const newChannel = await message.guild.channels.create(arg).catch(() => fail = true)
            if (fail) break
            channels = channels + "**" + newChannel.toString() + "** ✅\n"
        }

        if (fail) {
            return message.channel.send("❌ error creating channel(s)")
        }

        const embed = new CustomEmbed(message.member, false, channels)
            .setTitle("channel | " + message.member.user.username)
        return message.channel.send(embed)
    }

    if (args[0] == "delete" || args[0] == "del") {
        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed(`${prefix}channel **del**ete <channel>`))
        }

        args.shift()

        let count = 0

        message.mentions.channels.forEach(async channel => {
            count++
            await channel.delete().catch(() => {
                fail = true
                return message.channel.send(new ErrorEmbed("unable to delete channel: " + channel.name))
            })
        })

        if (fail) return

        const embed = new CustomEmbed(message.member, false, "✅ **" + count + "** channels deleted")
            .setTitle("channel | " + message.member.user.username)
        return message.channel.send(embed).catch()
    }

    if (args[0] == "rename" || args[0] == "r") {
        if (!args.length >= 3) {
            return message.channel.send(new ErrorEmbed(`${prefix}channel **r**ename <channel> <name>`))
        }
        const channel = message.mentions.channels.first()

        if (!channel) {
            return message.channel.send(new ErrorEmbed("invalid channel"))
        }

        args.shift()
        args.shift()

        const name = args.join("-")

        await channel.edit({name: name}).then(() => {
        }).catch(() => {
            fail = true
            return message.channel.send(new ErrorEmbed("unable to rename channel"))
        })

        if (fail) return

        const embed = new CustomEmbed(message.member, false, "✅ channel renamed to " + name)
            .setTitle("channel | " + message.member.user.username)
        return message.channel.send(embed)
    }

    if (args[0] == "nsfw") {
        if (args.length != 2) {
            return message.channel.send(new ErrorEmbed(`${prefix}channel nsfw <channel>`))
        }

        const channel = message.mentions.channels.first()

        if (!channel) {
            return message.channel.send(new ErrorEmbed("invalid channel"))
        }

        let perms = true

        if (!channel.nsfw) {
            await channel.edit({nsfw: true}).catch(() => {
                perms = false
                return message.channel.send(new ErrorEmbed("unable to edit that channel"))
            })
            if (!perms) {
                return
            }
            const embed = new CustomEmbed(message.member, false, channel.toString() + "\n\n✅ channel is now nsfw")
                .setTitle("channel | " + message.member.user.username)
            return message.channel.send(embed)
        } else {
            await channel.edit({nsfw: false}).catch(() => {
                perms = false
                return message.channel.send(new ErrorEmbed("unable to edit that channel"))
            })
            if (!perms) {
                return
            }
            const embed = new CustomEmbed(message.member, false, channel.toString() + "\n\n✅ channel is no longer nsfw")
                .setTitle("channel")
            return message.channel.send(embed)
        }
    }

    return message.channel.send("❌ $channel <**c**reate/**del**ete/**r**ename/nsfw> <channel> (name)")
}

cmd.setRun(run)

module.exports = cmd