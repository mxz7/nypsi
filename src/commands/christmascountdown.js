const { Message, Permissions } = require("discord.js")
const {
    hasGuild,
    createGuild,
    getChristmasCountdown,
    getPrefix,
    setChristmasCountdown,
    checkChristmasCountdown,
    hasChristmasCountdown,
    createNewChristmasCountdown,
} = require("../utils/guilds/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { daysUntilChristmas } = require("../utils/utils")

const cmd = new Command("christmascountdown", "create a christmas countdown", categories.ADMIN)
    .setAliases(["christmas", "xmas"])
    .setPermissions(["MANAGE_SERVER"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
        if (message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
            return message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] })
        }
        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `${daysUntilChristmas()} days until christmas`)],
        })
    }

    if (!message.guild.me.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
        return message.channel.send({
            embeds: [new ErrorEmbed("i need the `manage channels` permission for this command to work")],
        })
    }

    if (!hasGuild(message.guild)) createGuild(message.guild)

    if (!hasChristmasCountdown(message.guild)) createNewChristmasCountdown(message.guild)

    let profile = getChristmasCountdown(message.guild)
    const prefix = getPrefix(message.guild)

    const help = () => {
        const embed = new CustomEmbed(
            message.member,
            true,
            `${prefix}**xmas enable <channel>** *enables the christmas countdown in the given channel*\n` +
                `${prefix}**xmas disable** *disables the christmas countdown*\n` +
                `${prefix}**xmas channel <channel>** *change the channel used*\n` +
                `${prefix}**xmas format <new format>** *change the format for the countdown*`
        ).setTitle("christmas countdown")
        return message.channel.send({ embeds: [embed] })
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(
            message.member,
            false,
            `**enabled** \`${profile.enabled == 1 ? "true" : "false"}\`\n` +
                `**format** ${profile.format}\n**channel** \`${profile.channel}\``
        )
            .setTitle("christmas countdown")
            .setFooter(`use ${prefix}xmas help to view additional commands`)

        return message.channel.send({ embeds: [embed] })
    } else if (args[0].toLowerCase() == "enable") {
        if (profile.enabled) {
            return message.channel.send({ embeds: [new ErrorEmbed("already enabled")] })
        }

        let channel

        if (args.length == 1) {
            channel = await message.guild.channels.create("christmas")
        } else {
            if (args[1].length != 18) {
                if (message.mentions.channels.first()) {
                    channel = message.mentions.channels.first()
                } else {
                    return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] })
                }
            } else {
                const c = message.guild.channels.cache.find((c) => c.id == args[1])

                if (!c) {
                    return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] })
                } else {
                    channel = c
                }
            }
        }

        if (!channel) {
            return message.channel.send({ embeds: [new ErrorEmbed("error creating/getting channel")] })
        }

        profile.enabled = 1
        profile.channel = channel.id

        setChristmasCountdown(message.guild, profile)

        await checkChristmasCountdown(message.guild)

        profile = getChristmasCountdown(message.guild)

        if (!profile.enabled) {
            return message.channel.send({
                embeds: [new ErrorEmbed("error sending message: check permissions for nypsi")],
            })
        }

        return await message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ christmas countdown enabled")],
        })
    } else if (args[0].toLowerCase() == "disable") {
        if (!profile.enabled) {
            return message.channel.send({ embeds: [new ErrorEmbed("already disabled")] })
        }

        profile.enabled = 0
        profile.channel = "none"

        setChristmasCountdown(message.guild, profile)

        return await message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ christmas countdown disabled")],
        })
    } else if (args[0].toLowerCase() == "format") {
        if (args.length == 1) {
            const format = profile.format.split("%days%").join(daysUntilChristmas().toString())

            const embed = new CustomEmbed(
                message.member,
                false,
                "this is how the message will appear\n%days% will be replaced with how many days are left until christmas"
            )
                .setTitle("christmas countdown")
                .addField("current format", `\`${profile.format}\``, true)
                .addField("example", format, true)
                .addField("help", `to change this format, do ${prefix}**xmas format <new format>**`)

            return message.channel.send({ embeds: [embed] })
        }

        args.shift()

        const newFormat = args.join(" ")

        if (!newFormat.includes("%days%")) {
            return message.channel.send({ embeds: [new ErrorEmbed("format must include %days%")] })
        }

        if (newFormat.length > 250) {
            return message.channel.send({ embeds: [new ErrorEmbed("cannot be longer than 250 characters")] })
        }

        profile.format = newFormat

        setChristmasCountdown(message.guild, profile)

        await checkChristmasCountdown(message.guild)

        profile = getChristmasCountdown(message.guild)

        setChristmasCountdown(message.guild, profile)

        if (profile.enabled) {
            await checkChristmasCountdown(message.guild)

            profile = getChristmasCountdown(message.guild)

            if (!profile.enabled) {
                return message.channel.send({
                    embeds: [new ErrorEmbed("error sending message: check permissions for nypsi")],
                })
            }
        }

        const embed = new CustomEmbed(message.member, false, "✅ format updated").setTitle("christmas countdown")

        return message.channel.send({ embeds: [embed] })
    } else if (args[0].toLowerCase() == "channel") {
        if (args.length == 1) {
            const embed = new CustomEmbed(
                message.member,
                false,
                "by setting the channel it will change the channel that the message is sent in"
            )
                .setTitle("christmas countdown")
                .addField("current value", "`" + profile.channel + "`")
                .addField("help", `to change this value, do ${prefix}**xmas channel <channel id>**`)

            return message.channel.send({ embeds: [embed] })
        }

        let channel

        if (args[1].length != 18) {
            if (message.mentions.channels.first()) {
                channel = message.mentions.channels.first()
            } else {
                return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] })
            }
        } else {
            const c = message.guild.channels.cache.find((c) => c.id == args[1])

            if (!c) {
                return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] })
            } else {
                channel = c
            }
        }

        if (profile.channel == channel.id) {
            return message.channel.send({
                embeds: [new ErrorEmbed("channel must be different to current channel")],
            })
        }

        profile.channel = channel.id

        setChristmasCountdown(message.guild, profile)

        if (profile.enabled) {
            await checkChristmasCountdown(message.guild)

            profile = getChristmasCountdown(message.guild)

            if (!profile.enabled) {
                return message.channel.send({
                    embeds: [new ErrorEmbed("error sending message: check permissions for nypsi")],
                })
            }
        }

        const embed = new CustomEmbed(message.member, false, "✅ channel updated").setTitle("christmas countdown")

        return message.channel.send({ embeds: [embed] })
    } else {
        return help()
    }
}

cmd.setRun(run)

module.exports = cmd
