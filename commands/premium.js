const { Message } = require("discord.js")
const { getPrefix } = require("../guilds/utils")
const { isPremium, getPremiumProfile, setTier, setEmbedColor, setStatus, setReason, addMember, renewUser, revokeUser, expireUser } = require("../premium/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders")
const { formatDate, daysAgo, daysUntil } = require("../utils/utils")

const cmd = new Command("premium", "view your premium status", categories.INFO).setAliases(["patreon"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const defaultMessage = () => {

        if (isPremium(message.member)) {
            const embed = new CustomEmbed(message.member, false)

            embed.setTitle("premium status")

            const profile = getPremiumProfile(message.member)

            const timeStarted = formatDate(profile.startDate)
            const timeAgo = daysAgo(profile.startDate)
            const expires = formatDate(profile.expireDate)
            const timeUntil = daysUntil(profile.expireDate)
            const embedColor = profile.embedColor

            let description = `**tier** ${profile.getLevelString()}\n**started** ${timeStarted} (${timeAgo} days ago)\n**expires** ${expires} (${timeUntil} days left)`

            if (profile.level >= 2) {
                description += `\n\n**color** #${embedColor} - (${getPrefix(message.guild)}setcolor)`
            }

            if (profile.level < 4) {
                description += "\n\nyou can upgrade your tier at https://www.patreon.com/nypsi"
            }

            embed.setDescription(description)
            embed.setFooter("thank you so much for supporting!")

            return message.channel.send(embed)
        } else {
            return message.channel.send(new CustomEmbed(message.member, false, "you currently have no premium membership\n\nhttps://www.patreon.com/nypsi").setFooter(`join the support server if this is an issue (${getPrefix(message.guild)}support)`))
        }
    }

    if (args.length == 0) {
        return defaultMessage()
    } else if (args[0].toLowerCase() == "check") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length == 1) {
            return message.channel.send(new ErrorEmbed("invalid syntax bro"))
        }

        const a = check(args[1])

        if (!a) {
            return message.channel.send(new CustomEmbed(message.member, false, "no premium data"))
        }

        console.log(a)

        const embed = new CustomEmbed(message.member, false, `level: ${a.level}\n\ncheck console for all info`).setTitle(args[1])
        
        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "update") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length < 4) {
            return message.channel.send(new ErrorEmbed("invalid syntax bro"))
        }

        if (!isPremium(args[2])) {
            return message.channel.send(new ErrorEmbed("this user does not have a profile, use $premium add dumbass check it before u update it"))
        }

        switch (args[1].toLowerCase()) {
        case "level":
            setTier(args[2], parseInt(args[3]))
            return message.channel.send(new CustomEmbed(message.member, false, `✅ tier changed to ${args[3]}`))
        case "embed":
            setEmbedColor(args[2], args[3])
            return message.channel.send(new CustomEmbed(message.member, false, `✅ embed color changed to ${args[3]}`))
        case "status" :
            setStatus(args[2], parseInt(args[3]))
            return message.channel.send(new CustomEmbed(message.member, false, `✅ status changed to ${args[3]}`))
        case "reason":
            setReason(args[2], args.join(" "))
            return message.channel.send(new CustomEmbed(message.member, false, `✅ status changed to ${args[3]}`))
        }
    } else if (args[0].toLowerCase() == "add") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length < 3) {
            return message.channel.send(new ErrorEmbed("invalid syntax bro"))
        }

        addMember(args[1], parseInt(args[2]))

        return message.channel.send(new CustomEmbed(message.member, false, "✅ created profile at tier " + args[2]))
    } else if (args[0].toLowerCase() == "renew") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length != 2) {
            return message.channel.send(new ErrorEmbed("invalid syntax bro"))
        }

        renewUser(args[1])

        return message.channel.send(new CustomEmbed(message.member, false, "✅ membership renewed"))
    } else if (args[0].toLowerCase() == "revoke") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length != 2) {
            return message.channel.send(new ErrorEmbed("invalid syntax bro"))
        }

        revokeUser(args[1], message.content)

        return message.channel.send(new CustomEmbed(message.member, false, "✅ membership revoked"))
    } else if (args[0].toLowerCase() == "expire") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length != 2) {
            return message.channel.send(new ErrorEmbed("invalid syntax bro"))
        }

        expireUser(args[1])

        return message.channel.send(new CustomEmbed(message.member, false, "✅ membership expired"))
    }
}

function check(member) {
    if (isPremium(member)) {
        return getPremiumProfile(member)
    } else {
        return null
    }
}

cmd.setRun(run)

module.exports = cmd