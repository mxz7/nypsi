const { MessageEmbed, Message } = require("discord.js");
const { getColor } = require("../utils/utils")
const { getCase, setReason } = require("../moderation/utils");
const { Command, categories } = require("../utils/classes/Command");

const cmd = new Command("reason", "set a reason for a case/punishment", categories.MODERATION).setPermissions(["MANAGE_MESSAGES"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

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

cmd.setRun(run)

module.exports = cmd