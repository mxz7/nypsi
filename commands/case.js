const { Message, Permissions, MessageActionRow, MessageButton } = require("discord.js")
const { getPrefix } = require("../utils/guilds/utils")
const { getCase, deleteCase, profileExists, createProfile } = require("../utils/moderation/utils")
const { Command, categories } = require("../utils/classes/Command")
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("case", "get information about a given case", categories.MODERATION).setPermissions([
    "MANAGE_MESSAGES",
    "MANAGE_SERVER",
])

cmd.slashEnabled = true
cmd.slashData.addIntegerOption((option) =>
    option.setName("case-number").setDescription("what case would you like to view").setRequired(true)
)

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message, args) {
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return

    const prefix = getPrefix(message.guild)

    const send = async (data) => {
        if (message.interaction) {
            await message.reply(data)
            return await message.fetchReply()
        } else {
            return await message.channel.send(data)
        }
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("case help")
            .addField("usage", `${prefix}case <caseID>`)
            .addField(
                "help",
                "to delete a case, react with ❌ after running the command\n" +
                    "dates are in MM/DD/YYYY format\n" +
                    `to delete data for the server, run ${prefix}**deleteallcases**\nto delete a case you need the \`manage server\` permission`
            )

        return send({ embeds: [embed] })
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    const case0 = getCase(message.guild, parseInt(args[0]))

    if (!case0) {
        return send({
            embeds: [new ErrorEmbed("couldn't find a case with the id `" + args[0] + "`")],
        })
    }

    case0.deleted = case0.deleted === 0 ? false : true

    const members = message.guild.members.cache
    const target = members.find((m) => m.user.id == case0.user)

    let reason = case0.command

    if (reason == "") {
        reason = "no reason specified"
    }

    const embed = new CustomEmbed(message.member, false)
        .setTitle("case " + case0.case_id)
        .addField("type", "`" + case0.type + "`", true)
        .addField("moderator", case0.moderator, true)
        .addField("date/time", `<t:${Math.floor(case0.time / 1000)}>`, true)
        .addField("user", "`" + case0.user + "`", true)
        .addField("reason", reason, true)
        .addField("deleted", case0.deleted.toString(), true)

    if (target) {
        embed.setDescription("punished user: " + target.toString())
    }

    const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId("❌").setLabel("delete").setStyle("DANGER")
    )

    let msg

    if (message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD) && !case0.deleted) {
        msg = await send({ embeds: [embed], components: [row] })
    } else {
        return await send({ embeds: [embed] })
    }

    const edit = async (data, msg) => {
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
            await edit({ components: [] }, msg)
        })

    if (reaction == "❌") {
        deleteCase(message.guild, case0.case_id.toString())

        const newEmbed = new CustomEmbed(
            message.member,
            false,
            "✅ case `" + case0.case_id + "` successfully deleted by " + message.member.toString()
        )

        await edit({ embeds: [newEmbed], components: [] }, msg)
    }
}

cmd.setRun(run)

module.exports = cmd
