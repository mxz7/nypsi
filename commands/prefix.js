const { MessageEmbed } = require("discord.js")
const { getPrefix, setPrefix } = require("../guilds/utils")
const { getColor } = require("../utils/utils")

module.exports = {
    name: "prefix",
    description: "change bot prefix",
    category: "info",
    permissions: ["MANAGE_GUILD"],
    run: async (message, args) => {

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
            return message.channel.send(prefix + "prefix <new prefix>")
        }

        if (args.join(" ").length > 3) {
            return message.channel.send("❌ prefix cannot be longer than 3 characters")
        }

        setPrefix(message.guild, args.join(" "))

        const embed = new MessageEmbed()
            .setTitle("prefix")
            .setDescription("✅ prefix updated to `" + args.join(" ") + "`")
            .setFooter("bot.tekoh.wtf")
            .setColor(color)

        return await message.channel.send(embed)

    }
}