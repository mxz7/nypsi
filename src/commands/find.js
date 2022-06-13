const { Message, Guild, User } = require("discord.js")
const { Command, Categories, NypsiCommandInteraction } = require("../utils/models/Command")
const { CustomEmbed } = require("../utils/models/EmbedBuilders.js")
const {
    topAmount,
    userExists,
    getBalance,
    getBankBalance,
    getMaxBankBalance,
    getXp,
    hasVoted,
    getPrestige,
    getMulti,
    topAmountGlobal,
} = require("../utils/economy/utils")
const { getPeaks } = require("../utils/guilds/utils")
const { getKarma, getLastCommand } = require("../utils/karma/utils")
const { isPremium, getPremiumProfile } = require("../utils/premium/utils")
const { formatDate, daysAgo } = require("../utils/functions/date")

const cmd = new Command("find", "find info", Categories.NONE).setPermissions(["bot owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (message.member.user.id != "672793821850894347") return

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)

        embed.setDescription(
            "$find gid <guildid>\n$find gname <guild name>\n$find id <userid>\n$find tag <user tag>\n$find top"
        )

        return message.channel.send({ embeds: [embed] })
    } else if (args[0].toLowerCase() == "gid") {
        if (args.length == 1) return message.react("❌")

        const guild = await message.client.guilds.fetch(args[1])

        if (!guild) return message.react("❌")

        return showGuild(message, guild)
    } else if (args[0].toLowerCase() == "gname") {
        if (args.length == 1) return message.react("❌")

        args.shift()

        const guild = message.client.guilds.cache.find((g) => g.name.includes(args.join(" ")))

        if (!guild) return message.react("❌")

        return showGuild(message, guild)
    } else if (args[0].toLowerCase() == "id") {
        if (args.length == 1) return message.react("❌")

        const user = await message.client.users.fetch(args[1])

        if (!user) return message.react("❌")

        return showUser(message, user)
    } else if (args[0].toLowerCase() == "tag") {
        if (args.length == 1) return message.react("❌")

        args.shift()

        const user = message.client.users.cache.find((u) => u.tag.includes(args.join(" ")))

        if (!user) return message.react("❌")

        return showUser(message, user)
    } else if (args[0].toLowerCase() == "top") {
        const balTop = await topAmountGlobal(10, message.client, false)

        const embed = new CustomEmbed(message.member, false, balTop.join("\n")).setTitle("top " + balTop.length)

        return message.channel.send({ embeds: [embed] })
    }
}

/**
 *
 * @param {Message} message
 * @param {Guild} guild
 */
async function showGuild(message, guild) {
    let balTop = await topAmount(guild, 5)

    const filtered = balTop.filter(function (el) {
        return el != null
    })

    balTop = filtered.join("\n")

    const owner = await guild.members.fetch(guild.ownerId)

    const invites = await guild.invites
        .fetch()
        .then((invites) => Array.from(invites.keys()))
        .catch(() => {})

    const embed = new CustomEmbed(message.member, false)
        .setDescription(`\`${guild.id}\``)
        .setTitle(guild.name)
        .addField(
            "info",
            `**owner** ${owner.user.tag} (${owner.user.id})
            **created** ${formatDate(guild.createdAt)}`,
            true
        )
        .addField(
            "member info",
            `**members** ${guild.memberCount.toLocaleString()}
    **peak** ${getPeaks(guild).toLocaleString()}`,
            true
        )

    if (invites && invites.length > 0) {
        embed.addField(`invite (${invites.length})`, invites[Math.floor(Math.random() & invites.length)])
    }

    if (balTop.length > 0) {
        embed.addField("top bal", balTop)
    }

    return message.channel.send({ embeds: [embed] })
}

/**
 *
 * @param {Message} message
 * @param {User} user
 */
async function showUser(message, user) {
    const guilds = []

    message.client.guilds.cache.forEach((g) => {
        if (g.members.cache.find((u) => u.id == user.id)) {
            guilds.push(`\`${g.id}\``)
        }
    })

    const embed = new CustomEmbed(message.member, false)
        .setTitle(user.tag)
        .setDescription(`\`${user.id}\`${isPremium(user.id) ? ` (${getPremiumProfile(user.id).getLevelString()}) ` : ""}`)
        .addField(
            "user",
            `**tag** ${user.tag}
            **created** ${formatDate(user.createdAt)}${
                (await getLastCommand(user.id))
                    ? `\n**last command** ${daysAgo(await getLastCommand(user.id))} days ago`
                    : ""
            }`,
            true
        )
        .setFooter(`${await getKarma(user.id)} karma`)

    if (userExists(user.id)) {
        const voted = await hasVoted(user.id)
        embed.addField(
            "economy",
            `💰 $**${getBalance(user.id).toLocaleString()}**
            💳 $**${getBankBalance(user.id).toLocaleString()}** / $**${getMaxBankBalance(user.id).toLocaleString()}**
            **xp** ${getXp(user.id).toLocaleString()}
            **voted** ${voted}
            **prestige** ${getPrestige(user.id)}
            **bonus** ${Math.floor(getMulti(user.id) * 100)}%`,
            true
        )
    }

    if (guilds.length > 0) {
        embed.addField("guilds", guilds.join(" "))
    }

    return message.channel.send({ embeds: [embed] })
}

cmd.setRun(run)

module.exports = cmd
