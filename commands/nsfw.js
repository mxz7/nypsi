const { Message, Permissions } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("nsfw", "toggle nsfw on a channel", categories.ADMIN).setPermissions(["MANAGE_CHANNELS"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage channels` permission")] })
        }
        return
    }

    if (!message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `manage channel` permission for this command to work")],
        })
    }

    let channel

    if (args.length == 0) {
        channel = message.channel
    } else if (message.mentions.channels.first()) {
        channel = message.mentions.channels.first()
    } else {
        channel = message.guild.channels.cache.find((ch) => ch.name.includes(args[0]))

        if (!channel) {
            return message.channel.send({ embeds: [new ErrorEmbed("couldn't find that channel")] })
        }
    }

    if (!channel) {
        return message.channel.send({ embeds: [new ErrorEmbed("couldn't find that channel")] })
    }

    if (!channel.isText()) {
        return message.channek.send({ embeds: [new ErrorEmbed("this is not a text channel")] })
    }

    if (!channel.nsfw) {
        let fail = false
        await channel.setNSFW(true).catch(() => {
            fail = true
        })

        if (fail) {
            return message.channel.send({ embeds: [new ErrorEmbed("unable to edit that channel")] })
        }

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `✅ ${channel.toString()} is now nsfw`)],
        })
    } else {
        let fail = false
        await channel.setNSFW(false).catch(() => {
            fail = true
        })

        if (fail) {
            return message.channel.send({ embeds: [new ErrorEmbed("unable to edit that channel")] })
        }

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `✅ ${channel.toString()} is no longer nsfw`)],
        })
    }
}

cmd.setRun(run)

module.exports = cmd
