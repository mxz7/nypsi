const { Message, MessageActionRow, MessageButton } = require("discord.js")
const { Command, categories } = require("../utils/models/Command")
const { getMember } = require("../utils/utils")
const { ErrorEmbed, CustomEmbed } = require("../utils/models/EmbedBuilders.js")

const avatar = new Command("avatar", "get a person's avatar", categories.INFO)

avatar.setAliases(["av", "pfp", "picture"])

avatar.slashEnabled = true

avatar.slashData.addUserOption((option) =>
    option.setName("user").setDescription("view avatar of this user").setRequired(false)
)

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

    let serverAvatar = member.displayAvatarURL({ dynamic: true, size: 256 })

    if (avatar == serverAvatar) {
        serverAvatar = undefined
    }

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("x").setLabel("show server avatar").setStyle("PRIMARY")
    )

    const embed = new CustomEmbed(member, false).setTitle(member.user.tag).setImage(avatar)

    let msg

    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
        }
    }

    if (serverAvatar) {
        msg = await send({ embeds: [embed], components: [row] })
    } else {
        return send({ embeds: [embed] })
    }

    const edit = async (data) => {
        if (message.interaction) {
            await message.editReply(data)
            return await message.fetchReply()
        } else {
            return await msg.edit(data)
        }
    }

    const filter = (i) => i.user.id == message.author.id

    const reaction = await msg
        .awaitMessageComponent({ filter, time: 15000, errors: ["time"] })
        .then(async (collected) => {
            await collected.deferUpdate()
            return collected.customId
        })
        .catch(async () => {
            await edit({ components: [] })
        })

    if (reaction == "x") {
        embed.setImage(serverAvatar)

        await edit({ embeds: [embed], components: [] })
    }
}

avatar.setRun(run)

module.exports = avatar
