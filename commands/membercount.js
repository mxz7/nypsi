const { MessageEmbed, Message } = require("discord.js")
const { getColor, getTimestamp } = require("../utils/utils")
const { hasStatsProfile, createDefaultStatsProfile, setStatsProfile, getStatsProfile, hasGuild, createGuild, getPeaks } = require("../guilds/utils")
const { Command, categories } = require("../utils/classes/Command")

const cmd = new Command("membercount", "create an updating member count channel for your server", categories.MODERATION).setAliases(["counter"]).setPermissions(["MANAGE_SERVER"])

/**
 * @param {Message} message 
 * @param {Array<String>} args 
 */
async function run(message, args) {

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
            .setFooter("use $counter help to view additional commands")
            .setDescription("**enabled** `" + profile.enabled + "`\n" +
                "**filter bots** `" + profile.filterBots + "`\n" +
                "**channel** `" + profile.channel + "`\n" + 
                "**format** `" + profile.format + "`")

        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "help") {
        const embed = new MessageEmbed()
            .setTitle("member count")
            .setColor(color)
            .setFooter("member count will be updated every 10 minutes")
            .setDescription("$**counter enable** *enables the counter and creates a channel with the current format*\n" +
                "$**counter disable** *disables the counter and does NOT delete the channel*\n" +
                "$**counter format** *view/change the current channel format*\n" +
                "$**counter filterbots** *view/change the setting to filter bots*\n" +
                "$**counter channel** *set a channel as the channel to be used*")
        
        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "enable") {

        if (profile.enabled) {
            return message.channel.send("❌ already enabled")
        }

        const role = message.guild.roles.cache.find(r => r.name == "@everyone")

        let memberCount = await message.guild.members.fetch()

        if (profile.filterBots) {
            memberCount = memberCount.filter(m => !m.user.bot)
        }

        let format = ""

        format = profile.format.split("%count%").join(memberCount.size.toLocaleString())
        format = format.split("%peak%").join(getPeaks(message.guild).members)

        let fail = false

        const channel = await message.guild.channels.create(format, {type: "voice", permissionOverwrites: [{
            id: role.id,
            deny: ["CONNECT", "SEND_MESSAGES"]
        }]}).catch(() => {
            fail = true
            return message.channel.send("❌ error creating channel")
        })

        if (fail) return

        profile.enabled = true
        profile.channel = channel.id

        setStatsProfile(message.guild, profile)

        const embed = new MessageEmbed()
            .setTitle("member count")
            .setDescription("✅ channel successfully created")
            .setColor(color)
            .setFooter("channel will update every 10 minutes")

        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "disable") {

        if (!profile.enabled) {
            return message.channel.send("❌ already disabled")
        }

        profile.enabled = false
        profile.channel = "none"

        setStatsProfile(message.guild, profile)

        const embed = new MessageEmbed()
            .setTitle("member count")
            .setDescription("✅ counter successfully disabled")
            .setFooter("bot.tekoh.wtf")
            .setColor(color)

        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "format") {
        if (args.length == 1) {
            const embed = new MessageEmbed()
                .setTitle("member count")
                .setDescription("this is how your channel will appear\n %count% is replaced with the member count\n%peak% is replaced with the member peak")
                .addField("current format", "`" + profile.format + "`")
                .addField("help", "to change this format, do $**counter format <new format>**")
                .setFooter("bot.tekoh.wtf")
                .setColor(color)
            
            return message.channel.send(embed)
        }

        args.shift()

        const newFormat = args.join(" ")

        if (!newFormat.includes("%count%") && !newFormat.includes("%peak%")) {
            return message.channel.send("❌ format must include %count% or %peak% or both")
        }

        if (newFormat.length > 30) {
            return message.channel.send("❌ cannot be longer than 30 characers")
        }

        profile.format = newFormat

        setStatsProfile(message.guild, profile)

        const embed = new MessageEmbed()
            .setTitle("member count")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
            .setDescription("✅ format updated - will update channel on next interval")
            .addField("new format", "`" + newFormat + "`")

        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "filterbots") {
        if (args.length == 1) {
            const embed = new MessageEmbed()
                .setTitle("member count")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")
                .setDescription("if this is true, bots will not be counted towards the member count")
                .addField("current value", "`" + profile.filterBots + "`")
                .addField("help", "to change this option, do $**counter filterbots <new value (true/false)>**")
            
            return message.channel.send(embed)
        }

        if (args[1].toLowerCase() != "true" && args[1].toLowerCase() != "false") {
            return message.channel.send("❌ value must either be true or false")
        }

        if (args[1].toLowerCase() == "true") {
            profile.filterBots = true
        } else {
            profile.filterBots = false
        }

        const embed = new MessageEmbed()
            .setTitle("member count")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
            .setDescription("✅ value updated - will update channel on next interval")
            .addField("new value", "`" + profile.filterBots + "`")

        return message.channel.send(embed)
    } else if (args[0].toLowerCase() == "channel") { 
        if (args.length == 1) {
            const embed = new MessageEmbed()
                .setTitle("member count")
                .setColor(color)
                .setFooter("bot.tekoh.wtf")
                .setDescription("by setting the channel it will change the channel that is used to display the counter")
                .addField("current value", "`" + profile.channel + "`")
                .addField("help", "to change this value, do $**counter channel <channel id>**")

            return message.channel.send(embed)
        }

        let channel 

        if (args[1].length != 18) {
            if (message.mentions.channels.first()) {
                channel = message.mentions.channels.first()
            } else {
                return message.channel.send("❌ invalid channel")
            }
        } else {
            const c = message.guild.channels.find(c => c.id == args[1])

            if (!c) {
                return message.channel.send("❌ invalid channel")
            } else {
                channel = c
            }
        }

        if (profile.channel == channel.id) {
            return message.channel.send("❌ channel must be different to current channel")
        }

        profile.channel = channel.id

        let memberCount = await message.guild.members.fetch()

        if (profile.filterBots) {
            memberCount = memberCount.filter(m => !m.user.bot)
        }

        let format = ""

        format = profile.format.split("%count%").join(memberCount.size.toLocaleString())
        format = format.split("%peak%").join(getPeaks(message.guild).members)

        const old = channel.name

        let fail = false

        await channel.edit({name: format}).then(() => {
            console.log("[" + getTimestamp() + "] counter updated for '" + message.guild.name + "' ~ '" + old + "' -> '" + format + "'")
        }).catch(() => {
            console.log("[" + getTimestamp() + "] error updating counter in " + message.guild.name)
            fail = true
        })

        if (fail) {
            profile.enabled = false
            profile.channel = "none"
            return message.channel.send("❌ error updating channel")
        }

        const embed = new MessageEmbed()
            .setTitle("member count")
            .setColor(color)
            .setFooter("bot.tekoh.wtf")
            .setDescription("✅ channel updated")
            .addField("new value", "`" + profile.channel + "`")

        return message.channel.send(embed)
    } else {
        const embed = new MessageEmbed()
            .setTitle("member count")
            .setColor(color)
            .setFooter("member count will be updated every 10 minutes")
            .setDescription("$**counter enable** *enables the counter and creates a channel with the current format*\n" +
                "$**counter disable** *disables the counter and does NOT delete the channel*\n" +
                "$**counter format** *view/change the current channel format*\n" +
                "$**counter filterbots** *view/change the setting to filter bots*")
        
        return message.channel.send(embed)
    }

}

cmd.setRun(run)

module.exports = cmd