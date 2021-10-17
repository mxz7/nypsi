const startUp = Date.now()

const Discord = require("discord.js")
const { MessageEmbed } = require("discord.js")
const client = new Discord.Client({
    allowedMentions: {
        parse: ["users", "roles"],
    },
    makeCache: Discord.Options.cacheWithLimits({
        MessageManager: 100,
        ThreadManager: {
            sweepInterval: 1800,
        },
    }),
    presence: {
        status: "dnd",
        activity: {
            name: "nypsi.xyz",
        },
    },
    restTimeOffset: 169,
    shards: "auto",
    intents: [
        Discord.Intents.FLAGS.DIRECT_MESSAGES,
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_BANS,
        Discord.Intents.FLAGS.GUILD_MEMBERS,
        Discord.Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
        Discord.Intents.FLAGS.GUILD_WEBHOOKS,
        Discord.Intents.FLAGS.GUILD_INVITES,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    ],
})
const { token } = require("./config.json")
const { getUserCount, updateStats, doVote } = require("./utils/economy/utils.js")
const {
    runCheck,
    checkStats,
    hasStatsEnabled,
    checkChristmasCountdown,
    hasChristmasCountdownEnabled,
    runCountdowns,
    hasGuild,
    createGuild,
    runChristmas,
} = require("./utils/guilds/utils.js")
const { loadCommands, runPopularCommandsTimer } = require("./utils/commandhandler")
const { updateCache } = require("./utils/imghandler")
const { MStoTime, showTopGlobalBal } = require("./utils/utils")
const { runModerationChecks } = require("./utils/moderation/utils")
const { info, types, error, getWebhooks } = require("./utils/logger")

const snipe = new Map()
const eSnipe = new Map()
const mentions = new Map()

exports.eSnipe = eSnipe
exports.snipe = snipe
exports.mentions = mentions

loadCommands()

const ready = require("./events/ready")
const guildCreate = require("./events/guildCreate")
const guildDelete = require("./events/guildDelete")
const guildMemberUpdate = require("./events/guildMemberUpdate")
const guildMemberAdd = require("./events/guildMemberAdd")
const messageDelete = require("./events/messageDelete")
const messageUpdate = require("./events/messageUpdate")
const message = require("./events/message")
const channelCreate = require("./events/channelCreate")
const roleDelete = require("./events/roleDelete")
const guildMemberRemove = require("./events/guildMemberRemove")
const userUpdate = require("./events/userUpdate")

client.once("ready", ready.bind(null, client, startUp))
client.on("guildCreate", guildCreate.bind(null, client))
client.on("guildDelete", guildDelete.bind(null, client))
client.on("rateLimit", (rate) => {
    const a = rate.route.split("/")
    const reason = a[a.length - 1]
    error("rate limit: " + reason)
})
client.on("guildMemberUpdate", guildMemberUpdate.bind(null))
client.on("guildMemberAdd", guildMemberAdd.bind(null))
client.on("guildMemberRemove", guildMemberRemove.bind(null))
client.on("messageDelete", messageDelete.bind(null))
client.on("messageUpdate", messageUpdate.bind(null))
client.on("messageCreate", message.bind(null))
client.on("channelCreate", channelCreate.bind(null))
client.on("roleDelete", roleDelete.bind(null))
client.on("userUpdate", userUpdate.bind(null))

client.on("shardReady", (shardID) => info(`shard#${shardID} ready`, types.INFO))
client.on("shardDisconnect", (s, shardID) => info(`shard#${shardID} disconnected`))
client.on("shardError", (error1, shardID) => error(`shard#${shardID} error: ${error1}`))
client.on("shardReconnecting", (shardID) => info(`shard#${shardID} connecting`))

process.on("unhandledRejection", (e) => {
    let stack = e.stack.split("\n").join("\n\x1b[31m")

    error(stack)
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
        client.guilds.cache.forEach((guild) => {
            if (!hasGuild(guild)) return createGuild(guild)
        })
    }, 3600000)

    checkStats()

    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    if (client.user.id != "678711738845102087") return

    setInterval(async () => {
        await updateStats(client.guilds.cache.size, client.options.shardCount)
        info("guild count posted to top.gg: " + client.guilds.cache.size, types.AUTOMATION)
    }, 3600000)

    await updateStats(client.guilds.cache.size, client.options.shardCount)
    info("guild count posted to top.gg: " + client.guilds.cache.size, types.AUTOMATION)
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
 * @param {Boolean} dontDmTekoh
 */
async function requestDM(id, content, dontDmTekoh) {
    info(`DM requested with ${id}`)
    const member = await client.users.fetch(id)

    if (member) {
        await member
            .send({ content: content })
            .then(() => {
                info(`successfully sent DM to ${member.tag} (${member.id})`)
            })
            .catch(async () => {
                error(`failed to send DM to ${member.tag} (${member.id})`)
                if (!dontDmTekoh) {
                    const tekoh = await client.users.fetch("672793821850894347")

                    await tekoh.send({ content: `failed to send dm to ${id}\n\n${content}` })
                }
            })
        return true
    } else {
        error(`failed to send DM to ${member.id}`)
        if (!dontDmTekoh) {
            const tekoh = await client.users.fetch("672793821850894347")

            await tekoh.send({ content: `failed to send dm to ${id}\n\n${content}` })
        }
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

        return await tekoh.send({ content: `failed to fetch guild - user: ${id} role: ${roleID}` })
    }

    const role = await guild.roles.fetch(roleID)

    if (!role) {
        const tekoh = await client.users.fetch("672793821850894347")

        return await tekoh.send({ content: `failed to fetch role - user: ${id} role: ${roleID}` })
    }

    const user = await guild.members.fetch(id)

    if (!user) {
        const tekoh = await client.users.fetch("672793821850894347")

        return await tekoh.send({ content: `failed to fetch role - user: ${id} role: ${roleID}` })
    }

    if (roleID == "819870846536646666") {
        if (
            user.roles.cache.find((r) => r.id == "747066190530347089") &&
            !user.roles.cache.find((r) => r.id == "819870846536646666")
        ) {
            return "boost"
        }
    }

    return await user.roles.remove(role)
}

exports.requestRemoveRole = requestRemoveRole

/**
 * @param {String} guildID
 * @returns {Discord.Guild}
 */
async function getGuild(guildID) {
    let a = true

    let guild = await client.guilds.fetch(guildID).catch(() => {
        a = false
    })

    if (!a) return undefined

    return guild
}

exports.getGuild = getGuild

setTimeout(() => {
    info("logging in...", types.INFO)
    client.login(token).then(() => {
        setTimeout(() => {
            runPopularCommandsTimer(client, "747056029795221513", "823672263693041705")
            runCountdowns(client)
            runChristmas(client)
            showTopGlobalBal(client)
            runChecks()
            updateCache()
            runModerationChecks(client)
            getWebhooks(client)
        }, 10000)
    })
}, 500)
