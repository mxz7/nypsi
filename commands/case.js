const { Message } = require("discord.js");
const { getPrefix } = require("../guilds/utils");
const { getCase, deleteCase, profileExists, createProfile } = require("../moderation/utils");
const { Command, categories } = require("../utils/classes/Command");
const { ErrorEmbed, CustomEmbed } = require("../utils/classes/EmbedBuilders.js")

const cmd = new Command("case", "get information about a given case", categories.MODERATION).setPermissions(["MANAGE_MESSAGES", "MANAGE_SERVER"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    if (!message.member.hasPermission("MANAGE_MESSAGES")) return

    const prefix = getPrefix(message.guild)

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false)
            .setTitle("case help")
            .addField("usage", `${prefix}case <caseID>`)
            .addField("help", "to delete a case, react with ❌ after running the command\n" +
                "dates are in MM/DD/YYYY format\n" +
                `to delete data for the server, run ${prefix}**deleteallcases**\nto delete a case you need the \`manage server\` permission`)

        return message.channel.send(embed)
    }

    if (!profileExists(message.guild)) createProfile(message.guild)

    const case0 = getCase(message.guild, args[0])

    if (!case0) {
        return message.channel.send(new ErrorEmbed("couldn't find a case with the id `" + args[0] + "`"))
    }

    const date = new Date(case0.time).toLocaleString()

    const members = message.guild.members.cache
    const target = members.find(m => m.user.id == case0.user)

    let reason = case0.command

    if (reason == "") {
        reason = "no reason specified"
    }

    const embed = new CustomEmbed(message.member, false)
        .setTitle("case " + case0.id + " | " + message.member.user.username)
        .addField("type", "`" + case0.type + "`", true)
        .addField("moderator", case0.moderator, true)
        .addField("date/time", date, true)
        .addField("user", "`" + case0.user + "`", true)
        .addField("reason", reason, true)
        .addField("deleted", case0.deleted, true)
        
    if (target) {
        embed.setDescription("punished user: " + target.toString())
    }

    const msg = await message.channel.send(embed)

    if (case0.deleted) return

    if (!message.member.hasPermission("MANAGE_GUILD")) return

    await msg.react("❌")

    const filter = (reaction, user) => {
        return ["❌"].includes(reaction.emoji.name) && user.id == message.member.user.id
    }

    const reaction = await msg.awaitReactions(filter, { max: 1, time: 15000, errors: ["time"] })
        .then(collected => {
            return collected.first().emoji.name
        }).catch(async () => {
            await msg.reactions.removeAll()
        })

    if (reaction == "❌") {
        deleteCase(message.guild, case0.id)

        const newEmbed = new CustomEmbed(message.member, false, "✅ case `" + case0.id +  "` successfully deleted by " + message.member.toString())

        await msg.edit(newEmbed)
    }

}

cmd.setRun(run)

module.exports = cmd