const { MessageEmbed, Message } = require("discord.js");
const { getSnipeFilter, updateFilter } = require("../guilds/utils.js")
const { getColor } = require("../utils/utils")

module.exports = {
    name: "snipefilter",
    description: "change the snipe filter for your server",
    category: "moderation",
    aliases: ["sf", "filter"],
    permissions: ["MANAGE_SERVER"],
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        const color = getColor(message.member)

        if (!message.member.hasPermission("MANAGE_GUILD")) {
            if (message.member.hasPermission("MANAGE_MESSAGES")) {
                const embed = new MessageEmbed()
                    .setTitle("snipe filter")
                    .setDescription("❌ requires permission: *MANAGE_SERVER*")
                    .setFooter("bot.tekoh.wtf")
                    .setColor(color)
                return message.channel.send(embed)
            }
            return
        }

        let filter = getSnipeFilter(message.guild)

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("current snipe filter")
                .setDescription("`" + filter.join("`\n`") + "`")
                .setColor(color)
                .setFooter("use $sf (add/del/+/-) to modify the filter")
            
            return message.channel.send(embed)
        }

        if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "+") {
            if (args.length == 1) {
                return message.channel.send("❌ $sf add/+ <word> | cAsInG doesn't matter, it'll be filtered either way")
            }

            if (filter.indexOf(args[1].toString().toLowerCase()) > -1) {
                const embed = new MessageEmbed()
                    .setTitle("snipe filter")
                    .setDescription("❌ `" + args[1] + "` already exists in the filter")
                    .setColor(color)
                    .setFooter("you can use $sf to view the filter")

                return message.channel.send(embed)
            }

            filter.push(args[1].toString())

            if (filter.join("").length > 1000) {

                filter.splice(filter.indexOf(args[1].toString()), 1);

                const embed = new MessageEmbed()
                    .setTitle("snipe filter")
                    .setDescription("❌ filter has exceeded the maximum size - please use *$sf del/-* or *$sf reset*")
                    .setColor(color)
                    .setFooter("bot.tekoh.wtf")

                return message.channel.send(embed)
            }

            updateFilter(message.guild, filter)

            const embed = new MessageEmbed()
                .setTitle("snipe filter")
                .setDescription("✅ added `" + args[1] + "` to the filter")
                .setFooter("bot.tekoh.wtf")
                .setColor(color)
            return message.channel.send(embed)
        }

        if (args[0].toLowerCase() == "del" || args[0].toLowerCase() == "-") {
            if (args.length == 1) {
                return message.channel.send("❌ $sf del/- <word>")
            }

            if (filter.indexOf(args[1].toString()) > -1) {
                filter.splice(filter.indexOf(args[1].toString()), 1);
            } else {
                const embed = new MessageEmbed()
                    .setTitle("snipe filter")
                    .setDescription("❌ `" + args[1] + "` not found in the filter")
                    .setFooter("bot.tekoh.wtf")
                    .setColor(color)

                return message.channel.send(embed)
            }

            updateFilter(message.guild, filter)

            const embed = new MessageEmbed()
                .setTitle("snipe filter")
                .setDescription("✅ removed `" + args[1] + "` from the filter")
                .setFooter("you can use $sf reset to reset the filter")
                .setColor(color)

            return message.channel.send(embed)
        }

        if (args[0].toLowerCase() == "reset") {
            filter = ["discord.gg", "/invite/"]

            updateFilter(message.guild, filter)

            const embed = new MessageEmbed()
                .setTitle("snipe filter")
                .setDescription("✅ filter has been reset")
                .setFooter("you can use $sf to view the filter")
                .setColor(color)

            return message.channel.send(embed)
        }
    }
}