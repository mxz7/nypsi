import { CommandInteraction, Message, Permissions } from "discord.js"
import { newCase, profileExists, createProfile } from "../utils/moderation/utils"
import { inCooldown, addCooldown, getPrefix } from "../utils/guilds/utils"
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js"
import { getExactMember } from "../utils/utils"
import { PunishmentType } from "../utils/models/GuildStorage"

const cmd = new Command("warn", "warn one or more users", Categories.MODERATION).setPermissions(["MANAGE_MESSAGES"])

cmd.slashEnabled = true
cmd.slashData
    .addUserOption((option) => option.setName("user").setDescription("user to warn").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("reason for the warn"))

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return

    if (!profileExists(message.guild)) createProfile(message.guild)

    const prefix = getPrefix(message.guild)

    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data)
            const replyMsg = await message.fetchReply()
            if (replyMsg instanceof Message) {
                return replyMsg
            }
        } else {
            return await message.channel.send(data)
        }
    }

    if (args.length == 0 || !args[0]) {
        const embed = new CustomEmbed(message.member)
            .setHeader("warn help")
            .addField("usage", `${prefix}warn <@user(s)> (reason) [-s`)
            .addField(
                "help",
                "**<>** required | **()** optional | **[]** parameter\n" +
                    "**<@users>** you can warn one or more members in one command (must tag them)\n" +
                    "**(reason)** reason for the warn, will be given to all warned members\n" +
                    "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible\n\n" +
                    "if the bot was unable to DM a user on warn, the warning will still be logged"
            )
            .addField("examples", `${prefix}warn @member toxicity\n${prefix}warn @member @member2 toxicity`)

        return send({ embeds: [embed] })
    }

    if (args[0].length == 18 && message.mentions.members.first() == null) {
        let members

        if (inCooldown(message.guild)) {
            members = message.guild.members.cache
        } else {
            members = await message.guild.members.fetch()
            addCooldown(message.guild, 3600)
        }

        const member = members.find((m) => m.id == args[0])

        if (!member) {
            return send({
                embeds: [new ErrorEmbed("unable to find member with ID `" + args[0] + "`")],
            })
        }

        message.mentions.members.set(member.user.id, member)
    } else if (message.mentions.members.first() == null) {
        const member = await getExactMember(message.guild, args[0])

        if (!member) {
            return send({ embeds: [new ErrorEmbed("unable to find member `" + args[0] + "`")] })
        }

        message.mentions.members.set(member.user.id, member)
    }

    const members = message.mentions.members
    let reason

    if (args.length != members.size) {
        for (let i = 0; i < members.size; i++) {
            args.shift()
        }
        reason = args.join(" ")
    } else {
        return send({ embeds: [new ErrorEmbed("you must include a warn reason")] })
    }

    let count = 0
    const failed = []
    const error = []

    for (const member of members.keys()) {
        const targetHighestRole = members.get(member).roles.highest
        const memberHighestRole = message.member.roles.highest

        if (targetHighestRole.position >= memberHighestRole.position && message.guild.ownerId != message.member.user.id) {
            failed.push(members.get(member).user)
        } else {
            const embed = new CustomEmbed(members.get(member))
                .setTitle(`warned in ${message.guild.name}`)
                .addField("reason", `\`${reason}\``)

            await members
                .get(member)
                .send({ content: `you have been warned in ${message.guild.name}`, embeds: [embed] })
                .catch(() => {
                    error.push(members.get(member).user)
                })
            count++
        }

        if (members.get(member).user.id == message.client.user.id) {
            await send({ content: "wow... 😢" })
        }
    }

    if (count == 0) {
        return send({ embeds: [new ErrorEmbed("i was unable to warn any users")] })
    }

    const embed = new CustomEmbed(message.member, false, "✅ **" + count + "** members warned for: " + reason)

    if (count == 1 && failed.length == 0) {
        embed.setDescription("✅ `" + members.first().user.tag + "` has been warned for: " + reason)
    }

    if (failed.length != 0) {
        const failedTags = []
        for (const fail of failed) {
            failedTags.push(fail.tag)
        }

        embed.addField("error", "unable to warn: " + failedTags.join(", "))
    }

    if (error.length != 0) {
        const errorTags = []
        for (const err of error) {
            errorTags.push(err.tag)
        }

        embed.addField("warning", "unable to DM: " + errorTags.join(", "))
    }

    if (args.join(" ").includes("-s")) {
        if (message instanceof Message) {
            await message.delete()
            await message.member.send({ embeds: [embed] }).catch()
        } else {
            await message.reply({ embeds: [embed], ephemeral: true })
        }
    } else {
        await send({ embeds: [embed] })
    }

    const members1 = Array.from(members.keys())

    if (failed.length != 0) {
        for (const fail of failed) {
            if (members1.includes(fail.id)) {
                members1.splice(members1.indexOf(fail.id), 1)
            }
        }
    }

    newCase(message.guild, PunishmentType.WARN, members1, message.author.tag, reason)
}

cmd.setRun(run)

module.exports = cmd
