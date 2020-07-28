const Discord = require("discord.js");
const { MessageEmbed } = require("discord.js");
const client = new Discord.Client();
const { prefix, token } = require("./config.json");
const { getUserCount } = require("./economy/utils.js")
const { runCheck, hasGuild, createGuild, getSnipeFilter, checkStats, hasStatsProfile, hasStatsEnabled, createDefaultStatsProfile } = require("./guilds/utils.js")
const { runCommand, loadCommands } = require("./utils/commandhandler")
const { updateCache } = require("./utils/imghandler")
const { getTimestamp } = require("./utils/utils")

const dmCooldown = new Set()
const snipe = new Map()
const eSnipe = new Map()
let ready = false

loadCommands()

client.once("ready", async () => {
    const domains = ["lonely.lol", "tekoh.wtf", "tekoh.xyz", "alone.wtf"]

    setTimeout(() => {
        client.user.setPresence({
            status: "dnd",
            activity: {
                name: domains[Math.floor(Math.random() * domains.length)] + " | $help"
            }
        })
    }, 5000)

    setInterval(() => {
        client.user.setPresence({
            status: "dnd",
            activity: {
                name: domains[Math.floor(Math.random() * domains.length)] + " | $help"
            }
        })
    }, 600000)

    const { commandsSize } = require("./utils/commandhandler")

    console.log("\n--bot summary--")
    console.log("server count: " + client.guilds.cache.size.toLocaleString())
    console.log("user count: " + client.users.cache.size.toLocaleString())
    console.log("commands count: " + commandsSize)
    console.log("users in currency: " + getUserCount())
    console.log("--bot summary--\n");

    console.log("logged in as " + client.user.tag + " @ " + getTimestamp() + "\n- bot run log starting below -\n");
});

client.on("guildCreate", guild => {
    console.log("\x1b[36m[" + getTimestamp() + "] joined new server '" + guild.name + "' new count: " + client.guilds.cache.size + "\x1b[37m")
    if (!hasGuild(guild)) {
        createGuild(guild)
    }
})

client.on("guildDelete", guild => {
    console.log("\x1b[36m[" + getTimestamp() + "] removed from server '" + guild.name + "' new count: " + client.guilds.cache.size + "\x1b[37m")
})

client.on("rateLimit", rate => {
    const a = rate.route.split("/")
    const reason = a[a.length - 1]
    console.log("\x1b[31m[" + getTimestamp() + "] rate limit: " + reason + "\x1b[37m")
})

client.on("guildMemberAdd", member => {
    runCheck(member.guild)
})

client.on("messageDelete", message => {

    if (!message) return

    if (!message.member) return

    if (message.content != "" && !message.member.user.bot && message.content.length > 1) {

        const filter = getSnipeFilter(message.guild)

        for (word of filter) {
            const a = message.content.toLowerCase().split("`").join("")
            const b = a.split("*").join("")
            const c = b.split("|").join("")
            const d = c.split("_").join("")

            if (d.includes(word.toLowerCase())) return
        }

        snipe.set(message.channel.id, message)

        exports.snipe = snipe
    }
})

client.on("messageUpdate", message => {
    if (!message) return

    if (!message.member) return

    if (message.content != "" && !message.member.user.bot && message.content.length > 1) {

        const filter = getSnipeFilter(message.guild)

        for (word of filter) {
            const a = message.content.toLowerCase().split("`").join("")
            const b = a.split("*").join("")
            const c = b.split("|").join("")
            const d = c.split("_").join("")

            if (d.includes(word.toLowerCase())) return
        }

        eSnipe.set(message.channel.id, message)

        exports.eSnipe = eSnipe
    }
})

client.on("message", async message => {

    if (message.author.bot) return;

    if (!message.guild) {

        console.log("\x1b[33m[" + getTimestamp() + "] message in DM from " + message.author.tag + ": '" + message.content + "'\x1b[37m")

        if (dmCooldown.has(message.author.id)) return

        dmCooldown.add(message.author.id)

        setTimeout(() => {
            dmCooldown.delete(message.author.id)
        }, 1500)

        if (!message.content.toLowerCase().startsWith("$support ")) {
            const embed = new MessageEmbed()
                .setTitle("support")
                .setColor("#36393f")
                .setDescription("if you need support you can do one of the following:\n - add `max#0777` as a friend on discord\n\n - type `$support <support request>` and you will receive a reply soon")
                .setFooter("bot.tekoh.wtf")
            return await message.channel.send(embed)
        } else {
            const embed = new MessageEmbed()
                .setAuthor("support request")
                .setTitle(message.author.username + "#" + message.author.discriminator + " (" + message.author.id + ")")
                .setDescription(message.content.split("$support ").join(""))
            const TEKOHLOL = message.client.users.cache.find(m => m.id == "672793821850894347")
            if (!TEKOHLOL) {
                return await message.channel.send("❌ error sending message - please contact `max#0777`")
            } else {
                return await TEKOHLOL.send(embed).then(() => {
                    return message.channel.send("✅ support request sent - please be patient")
                }).catch(() => {
                    return message.channel.send("❌ error sending message - please contact `max#0777`")
                })
            }
        }
    }

    if (!message.content.startsWith(prefix)) return;

    if (!ready) return

    const args = message.content.substring(prefix.length).split(" ");

    const cmd = args[0].toLowerCase();

    return runCommand(cmd, message, args);
});

client.on("channelCreate", async ch => {
    if (!ch.guild) return
    const muteRole = ch.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

    if (!muteRole) return

    ch.updateOverwrite(muteRole,{
        SEND_MESSAGES: false,
        SPEAK: false,
        ADD_REACTIONS: false
    }).catch(() => {})
})

exports.snipe

setTimeout(() => {
    client.login(token).then(() => {
        setTimeout(() => {
            ready = true
            runChecks()
            updateCache()
        }, 2000)
    })
}, 2000)

function runChecks() {
    setInterval(async () => {
        client.guilds.cache.forEach(async guild => {
            runCheck(guild)
        })
    }, 30000)

    setInterval(async () => {
        client.guilds.cache.forEach(async guild => {
            if (hasStatsEnabled(guild)) {
                checkStats(guild)
            }
        })
    }, 600000)
}