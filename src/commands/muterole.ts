import { CommandInteraction, Message, Permissions, Role, ThreadChannel } from "discord.js"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
import { getPrefix } from "../utils/guilds/utils"
import { setMuteRole, getMuteRole, createProfile, profileExists } from "../utils/moderation/utils"

const cmd = new Command("muterole", "set the muterole for the server", Categories.ADMIN).setPermissions(["MANAGE_SERVER"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] })
        }
        return
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    const help = async () => {
        const current = getMuteRole(message.guild)

        let role

        if (current != "" && current) {
            role = await message.guild.roles.fetch(current)

            if (!role) {
                setMuteRole(message.guild, "")
                role = undefined
            }
        }

        return message.channel.send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    false,
                    `${getPrefix(message.guild)}**muterole set <role>** *set the muterole for the server*\n${getPrefix(
                        message.guild
                    )}**muterole reset** *reset the mute role to default*\n${getPrefix(
                        message.guild
                    )}**muterole update** *update mute permissions for every channel*\n\ncurrent mute role: ${
                        role ? role.toString() : "default"
                    }`
                ).setTitle("muterole"),
            ],
        })
    }

    if (args.length == 0) {
        return help()
    }

    if (args[0].toLowerCase() == "set") {
        if (args.length == 1) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        `${getPrefix(
                            message.guild
                        )}**muterole set <role>**\n\nyou can mention the role, use the role's ID or name`
                    ),
                ],
            })
        }

        const roles = message.guild.roles.cache

        let role

        if (message.mentions.roles.first()) {
            role = message.mentions.roles.first()
        } else if (args[1].length == 18 && parseInt(args[1])) {
            role = roles.find((r) => r.id == args[1])
        } else {
            args.shift()
            role = roles.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()))
        }

        if (!role) {
            return message.channel.send({
                embeds: [new ErrorEmbed(`couldn't find the role \`${args.join(" ")}\``)],
            })
        }

        setMuteRole(message.guild, role)

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `✅ muterole has been updated to ${role.toString()}`)],
        })
    } else if (args[0].toLowerCase() == "reset") {
        setMuteRole(message.guild, "default")

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ muterole has been reset")],
        })
    } else if (args[0].toLowerCase() == "update") {
        let channelError = false
        try {
            let muteRole = await message.guild.roles.fetch(getMuteRole(message.guild))

            if (getMuteRole(message.guild) == "") {
                muteRole = await message.guild.roles.cache.find((r) => r.name.toLowerCase() == "muted")
            }

            if (!muteRole) {
                const newMuteRole = await message.guild.roles
                    .create({
                        name: "muted",
                    })
                    .catch(() => {
                        channelError = true
                    })

                if (newMuteRole instanceof Role) {
                    muteRole = newMuteRole
                }
            }

            await message.guild.channels.cache.forEach(async (channel) => {
                if (channel instanceof ThreadChannel) return
                await channel.permissionOverwrites
                    .edit(muteRole, {
                        SEND_MESSAGES: false,
                        SPEAK: false,
                        ADD_REACTIONS: false,
                    })
                    .catch(() => {
                        channelError = true
                    })
            })
        } catch (e) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "error creating mute role - make sure i have `manage roles` permission and `manage channels`"
                    ),
                ],
            })
        }
        if (channelError) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "error creating mute role - make sure i have `manage roles` permission and `manage channels`"
                    ),
                ],
            })
        }

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ permissions were updated")],
        })
    }
}

cmd.setRun(run)

module.exports = cmd
