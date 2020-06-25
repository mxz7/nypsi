const { MessageEmbed } = require("discord.js")
const { getColor } = require("../utils/utils")
const { hasStatsProfile, hasStatsEnabled, createDefaultStatsProfile, setStatsProfile, getStatsProfile, hasGuild, createGuild } = require("../guilds/utils")

module.exports = {
    name: "membercount",
    description: "create an updating member count channel for your server",
    category: "moderation",
    run: async (message, args) => {

        const color = getColor(message.member)

        if (!message.member.hasPermission("MANAGE_GUILD")) {
            if (message.member.hasPermission("MANAGE_MESSAGES")) {
                const embed = new MessageEmbed()
                    .setTitle("member count")
                    .setDescription("❌ requires permission: *MANAGE_SERVER*")
                    .setFooter("bot.tekoh.wtf")
                    .setColor(color)
                return message.channel.send(embed)
            }
            return
        }

        if (!message.guild.me.hasPermission("MANAGE_CHANNELS")) {
            return message.channel.send("❌ i am lacking permission: 'MANAGE_CHANNELS'")
        }

        if (!hasGuild(message.guild)) createGuild(message.guild)

        if (!hasStatsProfile(message.guild)) createDefaultStatsProfile(message.guild)

        const profile = getStatsProfile(message.guild)

        if (args.length == 0) {
            const embed = new MessageEmbed()
                .setTitle("member count")
                .setColor(color)
                .setFooter("use $count help to view additional commands")
                .setDescription("**enabled** `" + profile.enabled + "`\n" +
                    "**filter bots** `" + profile.filterBots + "`\n" +
                    "**channel** `" + profile.channel + "`\n" + 
                    "**format** `" + profile.format + "`")

            return message.channel.send(embed)
        }

        

    }
}