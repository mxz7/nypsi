const { MessageEmbed } = require("discord.js")
const { getCase, deleteCase, profileExists, createProfile } = require("../moderation/utils")
const { getColor } = require("../utils/utils")

module.exports = {
    name: "case",
    description: "get information about a given case",
    category: "moderation",
    permissions: ["MANAGE_MESSAGES"],
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) return

        const color = getColor(message.member)

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("case help")
                .setColor(color)
                .addField("usage", "$case <caseID>")
                .addField("help", "to delete a case, react with ❌ after running the command\n" +
                    "to delete data for the server, run $**deleteallcases**")
                .setFooter("bot.tekoh.wtf")

            return message.channel.send(embed)
        }

        if (!profileExists(message.guild)) createProfile(message.guild)

        const case0 = getCase(message.guild, args[0])

        if (!case0) {
            return message.channel.send("❌ couldn't find a case with the id `" + args[0] + "`")
        }

        const date = new Date(case0.time).toLocaleString()

        const members = message.guild.members.cache
        const target = members.find(m => m.user.id == case0.user)

        const embed = new MessageEmbed()
            .setTitle("case " + case0.id)
            .addField("type", "`" + case0.type + "`", true)
            .addField("moderator", case0.moderator, true)
            .addField("date/time", date, true)
            .addField("user", "`" + case0.user + "`", true)
            .addField("command", case0.command, true)
            .addField("deleted", case0.deleted, true)
            .setFooter("bot.tekoh.wtf")
            .setColor(color)
            
        if (target) {
            embed.setDescription("punished user: " + target.toString())
        }

        const msg = await message.channel.send(embed)

        if (case0.deleted) return

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

            const newEmbed = new MessageEmbed()
                .setDescription("✅ case `" + case0.id +  "` deleted by " + message.member.toString())
                .setColor(color)

            await msg.edit(newEmbed)
        }
    }
}