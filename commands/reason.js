const { MessageEmbed, Message } = require("discord.js");
const { getColor } = require("../utils/utils")
const { getCase, setReason } = require("../moderation/utils")

module.exports = {
    name: "reason",
    description: "set a reason for a case/punishment",
    category: "moderation",
    permissions: ["MANAGE_MESSAGES"],
    /**
     * @param {Message} message 
     * @param {Array} args 
     */
    run: async (message, args) => {

        if (!message.member.hasPermission("MANAGE_MESSAGES")) return

        const color = getColor(message.member)

        if (args.length <= 1) {
            const embed = new MessageEmbed()
                .setTitle("reason help")
                .setColor(color)
                .addField("usage", "$reason <case ID> <new reason>")
                .addField("help", "use this command to change the current reason for a punishment case")
                .setFooter("bot.tekoh.wtf")
            
            return await message.channel.send(embed)
        }

        const caseID = args[0]

        args.shift()

        const reason = args.join(" ")

        const case0 = getCase(message.guild, caseID)

        if (!case0) {
            return message.channel.send("❌ couldn't find a case with the id `" + caseID + "`")
        }

        setReason(message.guild, caseID, reason)

        const embed = new MessageEmbed()
            .setTitle("reason | " + message.member.user.username)
            .setDescription("✅ case updated")
            .setFooter("bot.tekoh.wtf")
            .setColor(color)

        return message.channel.send(embed)
    }
}