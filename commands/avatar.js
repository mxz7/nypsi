const { Message } = require("discord.js")
const { Command, categories } = require("../utils/classes/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const avatar = new Command("avatar", "get a person's avatar", categories.INFO)

avatar.setAliases(["av", "pfp", "picture"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    let member

    if (args.length == 0) {
        member = message.member
    } else {
        if (!message.mentions.members.first()) {
            member = await getMember(message, args.join(" "))
        } else {
            member = message.mentions.members.first()
        }
    }

    if (!member) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] })
    }

    const avatar = member.user.displayAvatarURL({ dynamic: true, size: 256 })

    const embed = new CustomEmbed(member, false).setTitle(member.user.tag).setImage(avatar)

    message.channel.send({ embeds: [embed] })
}

avatar.setRun(run)

module.exports = avatar
