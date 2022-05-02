import { CommandInteraction, Message, Permissions } from "discord.js"
const Discord = require("discord.js")
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"

const cooldown = new Map()

const cmd = new Command(
    "lockdown",
    "lockdown a channel (will only work if permissions are setup correctly)",
    Categories.MODERATION
)
    .setAliases(["lock", "shutup"])
    .setPermissions(["MANAGE_MESSAGES", "MANAGE_CHANNELS"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | NypsiCommandInteraction & CommandInteraction) {
    if (
        !message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS) ||
        !message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)
    ) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({
                embeds: [new ErrorEmbed("you need the `manage channels` and `manage messages` permission")],
            })
        }
        return
    }

    if (
        !message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS) ||
        !message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES)
    ) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `manage channels` and `manage roles` permission for this command to work")],
        })
    }

    if (cooldown.has(message.member.id)) {
        const init = cooldown.get(message.member.id)
        const curr = new Date()
        const diff = Math.round((curr.getTime() - init) / 1000)
        const time = 2 - diff

        const minutes = Math.floor(time / 60)
        const seconds = time - minutes * 60

        let remaining: string

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`
        } else {
            remaining = `${seconds}s`
        }
        return message.channel.send({ embeds: [new ErrorEmbed(`still on cooldown for \`${remaining}\``)] })
    }

    /**
     * @type {Discord.TextChannel}
     */
    let channel = message.channel

    if (message.mentions.channels.first()) {
        channel = message.mentions.channels.first()
    }

    cooldown.set(message.member.id, new Date())
    setTimeout(() => {
        cooldown.delete(message.author.id)
    }, 1500)

    let locked = false

    const role = message.guild.roles.cache.find((role) => role.name == "@everyone")

    const a = channel.permissionOverwrites.cache.get(role.id)

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
        await channel.permissionOverwrites.edit(role, {
            SEND_MESSAGES: false,
        })

        const embed = new CustomEmbed(message.member, false, "✅ " + channel.toString() + " has been locked").setTitle(
            "lockdown"
        )

        return message.channel.send({ embeds: [embed] }).catch(() => {
            return message.member.send({ embeds: [embed] }).catch()
        })
    } else {
        await channel.permissionOverwrites.edit(role, {
            SEND_MESSAGES: null,
        })
        const embed = new CustomEmbed(message.member, false, "✅ " + channel.toString() + " has been unlocked").setTitle(
            "lockdown"
        )

        return message.channel.send({ embeds: [embed] }).catch(() => {
            return message.member.send({ embeds: [embed] })
        })
    }
}

cmd.setRun(run)

module.exports = cmd
