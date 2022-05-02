import { CommandInteraction, Message } from "discord.js"
import { getPrefix } from "../utils/guilds/utils"
const {
    isPremium,
    getPremiumProfile,
    setTier,
    setEmbedColor,
    setStatus,
    setReason,
    addMember,
    renewUser,
    expireUser,
    getUserCommand,
} = require("../utils/premium/utils")
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command"
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders"
const { formatDate, daysAgo, daysUntil } = require("../utils/utils")

const cmd = new Command("premium", "view your premium status", Categories.INFO).setAliases(["patreon"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
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

            description += `\n\n**color** #${embedColor} - ${getPrefix(message.guild)}setcolor`

            if (profile.level > 2) {
                const cmd = getUserCommand(message.author.id)
                description += `\n**custom command** ${cmd ? cmd.content : "none"}`
            }

            if (profile.level < 4) {
                description += "\n\nyou can upgrade your tier at https://www.patreon.com/nypsi"
            }

            embed.setDescription(description)
            embed.setFooter("thank you so much for supporting!")

            return message.channel.send({ embeds: [embed] })
        } else {
            const embed = new CustomEmbed(
                message.member,
                false,
                "you currently have no premium membership, this is what helps keep nypsi running, any donations are massively greatful :heart:"
            )

            embed.addField(
                "payment methods",
                "[ko-fi](https://ko-fi.com/tekoh/tiers)\n[patreon](https://patreon.com/nypsi)\n\n" +
                    "if you'd like to pay another way (crypto, paypal) join the [support server](https://discord.gg/hJTDNST)"
            )

            return message.channel.send({ embeds: [embed] })
        }
    }

    if (args.length == 0) {
        return defaultMessage()
    } else if (args[0].toLowerCase() == "check" || args[0].toLowerCase() == "status") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length == 1) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] })
        }

        const user = await message.client.users.fetch(args[1])

        if (!user) return message.channel.send({ embeds: [new ErrorEmbed("user doesnt exist")] })

        if (isPremium(user.id)) {
            const embed = new CustomEmbed(message.member, false)

            embed.setTitle("premium status")

            const profile = getPremiumProfile(user.id)

            const timeStarted = formatDate(profile.startDate)
            const timeAgo = daysAgo(profile.startDate)
            const expires = formatDate(profile.expireDate)
            const timeUntil = daysUntil(profile.expireDate)

            let description = `**tier** ${profile.getLevelString()}\n**started** ${timeStarted} (${timeAgo} days ago)\n**expires** ${expires} (${timeUntil} days left)`

            if (profile.level > 2) {
                const cmd = getUserCommand(user.id)
                description += `\n**custom command** ${cmd ? cmd.content : "none"}`
            }

            embed.setDescription(description)

            return message.channel.send({ embeds: [embed] })
        } else {
            const embed = new CustomEmbed(message.member, false, "no premium membership")

            return message.channel.send({ embeds: [embed] })
        }
    } else if (args[0].toLowerCase() == "update") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length < 4) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] })
        }

        if (!isPremium(args[2])) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "this user does not have a profile, use $premium add dumbass check it before u update it"
                    ),
                ],
            })
        }

        switch (args[1].toLowerCase()) {
            case "level":
                setTier(args[2], parseInt(args[3]))
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, false, `✅ tier changed to ${args[3]}`)],
                })
            case "embed":
                setEmbedColor(args[2], args[3])
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, false, `✅ embed color changed to ${args[3]}`)],
                })
            case "status":
                setStatus(args[2], parseInt(args[3]))
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, false, `✅ status changed to ${args[3]}`)],
                })
            case "reason":
                setReason(args[2], args.join(" "))
                return message.channel.send({
                    embeds: [new CustomEmbed(message.member, false, `✅ status changed to ${args[3]}`)],
                })
        }
    } else if (args[0].toLowerCase() == "add") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length < 3) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] })
        }

        addMember(args[1], parseInt(args[2]))

        return message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "✅ created profile at tier " + args[2])],
        })
    } else if (args[0].toLowerCase() == "renew") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length != 2) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] })
        }

        renewUser(args[1])

        return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "✅ membership renewed")] })
    } else if (args[0].toLowerCase() == "expire") {
        if (message.author.id != "672793821850894347") {
            return defaultMessage()
        }

        if (args.length != 2) {
            return message.channel.send({ embeds: [new ErrorEmbed("invalid syntax bro")] })
        }

        expireUser(args[1])

        return message.channel.send({ embeds: [new CustomEmbed(message.member, false, "✅ membership expired")] })
    }
}

cmd.setRun(run)

module.exports = cmd
