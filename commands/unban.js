const { Message } = require("discord.js");
const { getPrefix } = require("../guilds/utils");
const { profileExists, createProfile, newCase } = require("../moderation/utils");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("unban", "unban one or more users", categories.MODERATION).setPermissions(["BAN_MEMBERS"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.member.hasPermission("BAN_MEMBERS")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            return message.channel.send(new ErrorEmbed("requires permission: *BAN_MEMBERS*"))
        }
        return 
    }

    if (!message.guild.me.hasPermission("BAN_MEMBERS")) {
        return message.channel.send(new ErrorEmbed("i am lacking permission: 'BAN_MEMBERS'"));
    }

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setTitle("unban help")
            .addField("usage", `${prefix}unban <user(s)> [-s]`)
            .addField("help", "**<>** required | **[]** parameter\n" + "**<users>** you can unban one or more members in one command\n" +
                "**[-s]** if used, command message will be deleted and the output will be sent to moderator as a DM if possible")
            .addField("examples", `${prefix}unban user#1234 **(only works if members are in cache)**\n${prefix}unban 123456789012345678\n${prefix}unban 123456789012345678 123456789012345678 -s`)

        return message.channel.send(embed)
    }

    const members = []
    const failed = []

    if (!profileExists(message.guild)) createProfile(message.guild)

    for (arg of args) {
        if (arg.length == 18) {
            await message.guild.members.unban(arg, message.member.user.tag).then(user => {
                members.push(user.username + "#" + user.discriminator)
                newCase(message.guild, "unban", arg, message.member.user.tag, message.content)
            }).catch(() => {
                failed.push(arg)
            })
        } else if (arg.toLowerCase() != "-s") {
            try {
                const memberCache = message.client.users.cache

                const findingMember = memberCache.find(m => (m.username + "#" + m.discriminator).includes(arg))

                if (findingMember) {
                    const id = findingMember.id
                    await message.guild.members.unban(id, message.member.user.tag).then(user => {
                        members.push(user.username + "#" + user.discriminator)
                        newCase(message.guild, "unban", id, message.member.user.tag, message.content)
                    }).catch(() => {
                        failed.push(arg)
                    })
                }
            } catch {}
        }
    }

    if (members.length == 0) {
        return message.channel.send(new ErrorEmbed("i was unable to unban any users"))
    }

    const embed = new CustomEmbed(message.member, true)
        .setTitle(`unban | ${message.member.user.username}`)

    if (members.length == 1) {
        embed.setDescription("✅ `" + members[0] + "` was unbanned")
    } else {
        embed.setDescription("✅ **" + members.length + "** members have been unbanned")
    }

    if (failed.length != 0) {
        embed.addField("error", "unable to unban: " + failed.join(", "))
    }

    if (args.join(" ").includes("-s")) {
        await message.delete()
        return message.member.send(embed).catch()
    } else {
        return message.channel.send(embed)
    }

}

cmd.setRun(run)

module.exports = cmd