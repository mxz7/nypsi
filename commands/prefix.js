const { MessageEmbed, Message } = require("discord.js");
const { getPrefix, setPrefix } = require("../guilds/utils");
const { Command, categories } = require("../utils/classes/Command");
const { getColor } = require("../utils/utils")

const cmd = new Command("prefix", "change the bot's prefix", categories.INFO).setPermissions(["MANAGE_GUILD"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

    const prefix = getPrefix(message.guild)

    const color = getColor(message.member)

    if (!message.member.hasPermission("MANAGE_GUILD")) {
        if (message.member.hasPermission("MANAGE_MESSAGES")) {
            const embed = new MessageEmbed()
                .setTitle("prefix")
                .setDescription("❌ requires permission: *MANAGE_GUILD*")
                .setFooter("bot.tekoh.wtf")
                .setColor(color)
            return message.channel.send(embed)
        }
        return
    }

    if (args.length == 0) {
        const embed = new MessageEmbed()
            .setTitle("prefix")
            .setDescription("current prefix: `" + prefix + "`\n\nuse " + prefix + "**prefix** <new prefix> to change the current prefix")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")

        return message.channel.send(embed)
    }

    if (args.join(" ").length > 3) {
        return message.channel.send("❌ prefix cannot be longer than 3 characters")
    }

    setPrefix(message.guild, args.join(" "))

    const embed = new MessageEmbed()
        .setTitle("prefix")
        .setDescription("✅ prefix changed to `" + args.join(" ") + "`")
        .setFooter("bot.tekoh.wtf")
        .setColor(color)

    return await message.channel.send(embed)

}

cmd.setRun(run)

module.exports = cmd