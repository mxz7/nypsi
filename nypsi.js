const Discord = require("discord.js");
const { MessageEmbed } = require("discord.js");
const client = new Discord.Client();
const { token } = require("./config.json");
const { getUserCount, updateStats } = require("./economy/utils.js")
const { runCheck, hasGuild, createGuild, getSnipeFilter, checkStats, hasStatsEnabled, getPrefix, } = require("./guilds/utils.js")
const { runCommand, loadCommands } = require("./utils/commandhandler")
const { updateCache } = require("./utils/imghandler")
const { getTimestamp } = require("./utils/utils");
const { runUnmuteChecks, deleteMute, isMuted, profileExists } = require("./moderation/utils");

const dmCooldown = new Set()
const snipe = new Map()
const eSnipe = new Map()
let ready = false

exports.eSnipe
exports.snipe

loadCommands()

client.once("ready", async () => {
    const domains = ["lonely.lol", "tekoh.wtf", "tekoh.xyz", "alone.wtf"]

    setTimeout(() => {
        client.user.setPresence({
            status: "dnd",
            activity: {
                name: "$help | " + domains[Math.floor(Math.random() * domains.length)]
            }
        })
    }, 5000)

    setInterval(() => {
        client.user.setPresence({
            status: "dnd",
            activity: {
                name: "$help | " + domains[Math.floor(Math.random() * domains.length)]
            }
        })
    }, 600000)

    const { commandsSize } = require("./utils/commandhandler")

    let memberCount = 0

    await client.guilds.cache.forEach(g => {
        memberCount = memberCount + g.memberCount
    })

    console.log("\n ~~ tekoh.wtf ~~")
    console.log(" ~~ max#0777 ~~ ")

    console.log("\n--bot summary--")
    console.log("server count: " + client.guilds.cache.size.toLocaleString())
    console.log("user count: " + memberCount.toLocaleString())
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

    if (!profileExists(member.guild)) return

    if (isMuted(member.guild, member)) {
        const muteRole = member.guild.roles.cache.find(r => r.name.toLowerCase() == "muted")

        if (!muteRole) return deleteMute(member.guild, member)

        member.roles.add(muteRole)
    }
})

client.on("messageDelete", message => {

    if (!message) return

    if (!message.member) return

    if (message.content != "" && !message.member.user.bot && message.content.length > 1) {

        if (!hasGuild(message.guild)) createGuild(message.guild)

        const filter = getSnipeFilter(message.guild)

        const a = message.content.toLowerCase().split("`").join("")
        const b = a.split("*").join("")
        const c = b.split("|").join("")
        const d = c.split("_").join("")

        for (word of filter) {
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

        if (!hasGuild(message.guild)) createGuild(message.guild)

        const filter = getSnipeFilter(message.guild)

        const a = message.content.toLowerCase().split("`").join("")
        const b = a.split("*").join("")
        const c = b.split("|").join("")
        const d = c.split("_").join("")

        for (word of filter) {
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

        const embed = new MessageEmbed()
                .setTitle("support")
                .setColor("#36393f")
                .setDescription("support server: https://discord.gg/hJTDNST")
                .setFooter("bot.tekoh.wtf")
        return await message.channel.send(embed)
    }

    let prefix = getPrefix(message.guild)

    if (client.user.id == "685193083570094101") prefix = "£"

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

async function runChecks() {
    setInterval(async () => {
        client.guilds.cache.forEach(async guild => {
            await runCheck(guild)
        })
    }, 180000)

    setInterval(async () => {
        client.guilds.cache.forEach(async guild => {
            if (hasStatsEnabled(guild)) {
                checkStats(guild)
            }
        })
    }, 600000)

    if (client.user.username.includes("beta")) return

    setInterval(async () => {
        await updateStats(client.guilds.cache.size)
        console.log("[" + getTimestamp() + "] guild count posted to top.gg: " + client.guilds.cache.size)
    }, 3600000)

    await updateStats(client.guilds.cache.size)
    console.log("[" + getTimestamp() + "] guild count posted to top.gg: " + client.guilds.cache.size)
}

setTimeout(() => {
    client.login(token).then(() => {
        setTimeout(() => {
            ready = true
            runChecks()
            updateCache()
            runUnmuteChecks(client)
        }, 2000)
    })
}, 2000)