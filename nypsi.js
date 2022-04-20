const startUp = Date.now()

require("dotenv").config()

const Discord = require("discord.js")
const client = new Discord.Client({
    allowedMentions: {
        parse: ["users", "roles"],
    },
    makeCache: Discord.Options.cacheWithLimits({
        MessageManager: 100,
    }),
    sweepers: {
        messages: {
            lifetime: 60,
            interval: 120,
        },
    },
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

const { updateStats, doVote, runLotteryInterval } = require("./utils/economy/utils.js")
const {
    checkStats,
    runCountdowns,
    hasGuild,
    createGuild,
    runChristmas,
} = require("./utils/guilds/utils.js")
const { loadCommands, runPopularCommandsTimer } = require("./utils/commandhandler")
const { updateCache } = require("./utils/imghandler")
const { showTopGlobalBal } = require("./utils/utils")
const { runModerationChecks } = require("./utils/moderation/utils")
const { getWebhooks, logger } = require("./utils/logger")

const snipe = new Map()
const eSnipe = new Map()

exports.eSnipe = eSnipe
exports.snipe = snipe

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
const interactionCreate = require("./events/interactionCreate")

client.once("ready", ready.bind(null, client, startUp))
if (!process.env.GITHUB_ACTION) {
    client.on("guildCreate", guildCreate.bind(null, client))
    client.on("guildDelete", guildDelete.bind(null, client))
    client.on("rateLimit", (rate) => {
        const a = rate.route.split("/")
        const reason = a[a.length - 1]
        logger.warn("rate limit: " + reason)
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
    client.on("interactionCreate", interactionCreate.bind(null))
}

client.on("shardReady", (shardID) => logger.info(`shard#${shardID} ready`))
client.on("shardDisconnect", (s, shardID) => logger.info(`shard#${shardID} disconnected`))
client.on("shardError", (error1, shardID) => logger.error(`shard#${shardID} error: ${error1}`))
client.on("shardReconnecting", (shardID) => logger.info(`shard#${shardID} connecting`))

process.on("unhandledRejection", (e) => {
    logger.error(e.stack)
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

    if (client.user.id != "678711738845102087") return

    setInterval(async () => {
        await updateStats(client.guilds.cache.size, client.options.shardCount)
        logger.auto("guild count posted to top.gg: " + client.guilds.cache.size)
    }, 3600000)

    await updateStats(client.guilds.cache.size, client.options.shardCount)
    logger.auto("guild count posted to top.gg: " + client.guilds.cache.size)
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
    logger.info(`DM requested with ${id}`)
    const member = await client.users.fetch(id)

    if (member) {
        await member
            .send({ content: content })
            .then(() => {
                logger.success(`successfully sent DM to ${member.tag} (${member.id})`)
            })
            .catch(async () => {
                logger.warn(`failed to send DM to ${member.tag} (${member.id})`)
                if (!dontDmTekoh) {
                    const tekoh = await client.users.fetch("672793821850894347")

                    await tekoh.send({ content: `failed to send dm to ${id}\n\n${content}` })
                }
            })
        return true
    } else {
        logger.warn(`failed to send DM to ${member.id}`)
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

    // 747066190530347089 boost role
    // 819870727834566696 silver role
    // 819870846536646666 gold role

    if (roleID == "819870727834566696") {
        if (
            user.roles.cache.find((r) => r.id == "747066190530347089") &&
            !user.roles.cache.find((r) => r.id == "819870727834566696")
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
    logger.info("logging in...")
    client.login(process.env.BOT_TOKEN).then(() => {
        setTimeout(() => {
            runLotteryInterval(client)
            runPopularCommandsTimer(client, "747056029795221513", ["823672263693041705", "912710094955892817"])
            runCountdowns(client)
            runChristmas(client)
            showTopGlobalBal(client)
            runChecks()
            updateCache()
            runModerationChecks(client)
            getWebhooks(client)
        }, 10000)

        if (process.env.GITHUB_ACTION) {
            setTimeout(() => {
                process.exit(0)
            }, 30000)
        }
    })
}, 500)
