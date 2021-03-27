const startUp = Date.now()

const Discord = require("discord.js")
const { MessageEmbed } = require("discord.js")
const client = new Discord.Client({
    disableMentions: "everyone",
    messageCacheMaxSize: 150,
    messageSweepInterval: 10800,
    messageCacheLifetime: 9000,
    shards: "auto",
})
const { token } = require("./config.json")
const { getUserCount, updateStats, doVote } = require("./economy/utils.js")
const {
    runCheck,
    checkStats,
    hasStatsEnabled,
    checkChristmasCountdown,
    hasChristmasCountdownEnabled,
} = require("./guilds/utils.js")
const { loadCommands, runPopularCommandsTimer } = require("./utils/commandhandler")
const { updateCache } = require("./utils/imghandler")
const { getTimestamp, MStoTime } = require("./utils/utils")
const { runUnmuteChecks } = require("./moderation/utils")

const snipe = new Map()
const eSnipe = new Map()
const mentions = new Map()

exports.eSnipe = eSnipe
exports.snipe = snipe
exports.mentions = mentions

loadCommands()

const ready = require("./utils/events/ready")
const guildCreate = require("./utils/events/guildCreate")
const guildDelete = require("./utils/events/guildDelete")
const guildMemberUpdate = require("./utils/events/guildMemberUpdate")
const guildMemberAdd = require("./utils/events/guildMemberAdd")
const messageDelete = require("./utils/events/messageDelete")
const messageUpdate = require("./utils/events/messageUpdate")
const message = require("./utils/events/message")
const channelCreate = require("./utils/events/channelCreate")

client.once("ready", ready.bind(null, client, startUp))
client.on("guildCreate", guildCreate.bind(null, client))
client.on("guildDelete", guildDelete.bind(null, client))
client.on("rateLimit", (rate) => {
    const a = rate.route.split("/")
    const reason = a[a.length - 1]
    console.log("\x1b[31m[" + getTimestamp() + "] rate limit: " + reason + "\x1b[37m")
})
client.on("guildMemberUpdate", guildMemberUpdate.bind(null))
client.on("guildMemberAdd", guildMemberAdd.bind(null))
client.on("messageDelete", messageDelete.bind(null))
client.on("messageUpdate", messageUpdate.bind(null))
client.on("message", message.bind(null))
client.on("channelCreate", channelCreate.bind(null))

client.on("shardReady", (shardID) => console.log(`[${getTimestamp()}] shard#${shardID} ready`))

process.on("unhandledRejection", (error) => {
    let stack = error.stack.split("\n").join("\n\x1b[31m")

    if (stack.length > 200) {
        stack = stack.substr(0, 200) + "..."
    }

    console.log(`\x1b[31m[${getTimestamp()}] ${stack}\x1b[37m`)
})

async function checkGuild(guildID) {
    const g = await client.guilds.cache.find((gi) => gi.id == guildID)

    if (g) {
        return true
    } else {
        return false
    }
}

exports.checkGuild = checkGuild

async function runChecks() {
    setInterval(async () => {
        client.guilds.cache.forEach(async (guild) => {
            await runCheck(guild)
        })
    }, 180000)

    setInterval(async () => {
        client.guilds.cache.forEach(async (guild) => {
            if (hasStatsEnabled(guild)) {
                await checkStats(guild)
            }
        })
    }, 600000)

    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000)

    setTimeout(() => {
        setInterval(async () => {
            client.guilds.cache.forEach(async (guild) => {
                if (hasChristmasCountdownEnabled(guild)) await checkChristmasCountdown(guild)
            })
        }, 86400000)
        client.guilds.cache.forEach(async (guild) => {
            if (hasChristmasCountdownEnabled(guild)) await checkChristmasCountdown(guild)
        })
    }, needed - now)

    console.log(`[${getTimestamp()}] christmas countdowns will run in ${MStoTime(needed - now)}`)

    if (client.user.id != "678711738845102087") return

    setInterval(async () => {
        await updateStats(client.guilds.cache.size)
        console.log(
            "[" + getTimestamp() + "] guild count posted to top.gg: " + client.guilds.cache.size
        )
    }, 3600000)

    await updateStats(client.guilds.cache.size)
    console.log(
        "[" + getTimestamp() + "] guild count posted to top.gg: " + client.guilds.cache.size
    )
}

/**
 *
 * @param {JSON} vote
 */
async function onVote(vote) {
    doVote(client, vote)
}

exports.onVote = onVote

/**
 * @returns {Boolean}
 * @param {String} id
 */
async function requestDM(id, content) {
    const member = await client.users.fetch(id)

    if (member) {
        await member.send(content).catch(async () => {
            const tekoh = await client.users.fetch("672793821850894347")

            await tekoh.send(`failed to send dm to ${id}\n\n${content}`)
        })
        return true
    } else {
        const tekoh = await client.users.fetch("672793821850894347")

        await tekoh.send(`failed to send dm to ${id}\n\n${content}`)

        return false
    }
}

exports.requestDM = requestDM

/**
 * @param {String} id
 * @param {String} roleid
 */
async function requestRemoveRole(id, roleID) {
    const guild = await client.guilds.fetch("747056029795221513")

    if (!guild) {
        const tekoh = await client.users.fetch("672793821850894347")

        return await tekoh.send(`failed to fetch guild - user: ${id} role: ${roleID}`)
    }

    const role = await guild.roles.fetch(roleID)

    if (!role) {
        const tekoh = await client.users.fetch("672793821850894347")

        return await tekoh.send(`failed to fetch role - user: ${id} role: ${roleID}`)
    }

    const user = await guild.members.fetch(id)

    if (!user) {
        const tekoh = await client.users.fetch("672793821850894347")

        return await tekoh.send(`failed to fetch role - user: ${id} role: ${roleID}`)
    }

    return await user.roles.remove(role)
}

exports.requestRemoveRole = requestRemoveRole

/**
 * @param {String} guildID
 * @returns {Discord.Guild}
 */
async function getGuild(guildID) {
    const guild = await client.guilds.fetch(guildID)

    return guild
}

exports.getGuild = getGuild

setTimeout(() => {
    console.log(`[${getTimestamp()}] logging in...`)
    client.login(token).then(() => {
        setTimeout(() => {
            runPopularCommandsTimer(client, "747056029795221513", "823672263693041705")
            runChecks()
            updateCache()
            runUnmuteChecks(client)
        }, 2000)
    })
}, 1000)
