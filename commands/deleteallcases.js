const { Message, Permissions } = require("discord.js")
const { deleteServer, profileExists } = require("../utils/moderation/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("deleteallcases", "delete all cases in a server", categories.ADMIN)
    .setAliases(["dac"])
    .setPermissions(["server owner"])

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return

    if (
        message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES) &&
        message.guild.ownerId != message.member.user.id
    ) {
        const embed = new ErrorEmbed("to delete all cases you must be the server owner")

        return message.channel.send({ embeds: [embed] })
    }

    if (!profileExists(message.guild))
        return await message.channel.send({ embeds: [new ErrorEmbed("there are no cases to delete")] })

    const embed = new CustomEmbed(message.member, false, "react with ✅ to delete all punishment/moderation cases")
        .setTitle("confirmation")
        .setFooter("this cannot be reversed")

    const msg = await message.channel.send({ embeds: [embed] })

    await msg.react("✅")

    const filter = (reaction, user) => {
        return ["✅"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    const reaction = await msg
        .awaitReactions({ filter, max: 1, time: 15000, errors: ["time"] })
        .then((collected) => {
            return collected.first().emoji.name
        })
        .catch(async () => {
            await msg.reactions.removeAll()
        })

    if (reaction == "✅") {
        deleteServer(message.guild)

        const newEmbed = new CustomEmbed(message.member, false, "✅ all cases have been deleted").setDescription(
            "✅ all cases have been deleted"
        )

        await msg.edit({ embeds: [newEmbed] })
    }
}

cmd.setRun(run)

module.exports = cmd
