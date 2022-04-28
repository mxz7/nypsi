const { logger } = require("../logger")
const fs = require("fs")

let stats
if (process.env.GITHUB_ACTION) {
    stats = {}
} else {
    stats = JSON.parse(fs.readFileSync("./utils/economy/stats.json"))
}

logger.info(`${Array.from(Object.keys(stats)).length.toLocaleString()} economy stats users loaded`)

let banned
if (!process.env.GITHUB_ACTION) banned = JSON.parse(fs.readFileSync("./utils/economy/ban.json"))

let multiplier
if (!process.env.GITHUB_ACTION) multiplier = JSON.parse(fs.readFileSync("./utils/economy/slotsmulti.json"))

const topgg = require("@top-gg/sdk")
const express = require("express")
const { GuildMember, Guild, Client, WebhookClient } = require("discord.js")
const { CustomEmbed } = require("../classes/EmbedBuilders")
const { isPremium, getTier } = require("../premium/utils")
const { Worker, getAllWorkers } = require("./workers")
const { inPlaceSort } = require("fast-sort")
const fetch = require("node-fetch")
const { getDatabase } = require("../database/database")
const { addKarma, getKarma } = require("../karma/utils")
const shuffleArray = require("shuffle-array")
const { MStoTime } = require("../utils")
const { StatsProfile } = require("../classes/StatsProfile")
const db = getDatabase()

const webhook = new topgg.Webhook("123")
const topggStats = new topgg.Api(process.env.TOPGG_TOKEN)
const app = express()

const voteCache = new Map()
const existsCache = new Map()

app.post(
    "/dblwebhook",
    webhook.listener((vote) => {
        logger.info(`received vote: ${vote.user}`)
        const { onVote } = require("../../nypsi")
        onVote(vote)
    })
)

app.listen(5000)

if (!process.env.GITHUB_ACTION) {
    setInterval(() => {
        const stats1 = JSON.parse(fs.readFileSync("./utils/economy/stats.json"))

        if (JSON.stringify(stats) != JSON.stringify(stats1)) {
            fs.writeFile("./utils/economy/stats.json", JSON.stringify(stats), (err) => {
                if (err) {
                    return logger.error(err)
                }
                logger.info("economy stats data saved")
            })
        }
    }, 120000 + Math.floor(Math.random() * 60) * 1000)
}

setInterval(() => {
    const query = db.prepare("SELECT id, workers FROM economy WHERE workers != '{}'").all()

    for (const user of query) {
        const workers = JSON.parse(user.workers)

        const workers1 = JSON.parse(user.workers)

        for (let worker in workers) {
            worker = workers[worker]

            if (worker.stored < worker.maxStorage) {
                if (worker.stored + worker.perInterval > worker.maxStorage) {
                    worker.stored = worker.maxStorage
                } else {
                    worker.stored += worker.perInterval
                }
            }
        }

        if (workers != workers1) {
            db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(workers), user.id)
        }
    }
}, 5 * 60 * 1000)

let items

const lotteryTicketPrice = 10000
/**
 * higher ticket price = more favourable to rich people cus poor people cant buy tickets resulting in less tickets overall
 * the goal is to have more tickets overall for a more random outcome
 */
exports.lotteryTicketPrice = lotteryTicketPrice

let lotteryHook

if (!process.env.GITHUB_ACTION) {
    lotteryHook = new WebhookClient({ url: process.env.LOTTERY_HOOK })
}

const lotteryHookQueue = new Map()

setInterval(() => {
    if (lotteryHookQueue.size == 0) return

    const desc = []

    for (const username of lotteryHookQueue.keys()) {
        const amount = lotteryHookQueue.get(username)

        desc.push(`**${username}** has bought **${amount}** lottery ticket${amount > 1 ? "s" : ""}`)
    }

    lotteryHookQueue.clear()

    const embed = new CustomEmbed()

    embed.setColor("#111111")
    embed.setDescription(desc.join("\n"))
    embed.setTimestamp()

    lotteryHook.send({ embeds: [embed] })
}, 120000)

/**
 *
 * @returns {String}
 */
function loadItems() {
    let txt = ""
    items = JSON.parse(fs.readFileSync("./utils/economy/items.json"))
    logger.info(`${Array.from(Object.keys(items)).length.toLocaleString()} economy items loaded`)

    txt += `${Array.from(Object.keys(items)).length.toLocaleString()} economy items loaded`

    let deleted = 0

    const query = db.prepare("SELECT id, inventory FROM economy").all()

    for (const user of query) {
        let inventory = JSON.parse(user.inventory)

        if (!inventory) {
            inventory = {}
            db.prepare("UPDATE economy SET inventory = '{}' WHERE id = ?").run(user.id)
        }

        const inventory1 = JSON.parse(user.inventory)

        for (const item of Array.from(Object.keys(inventory))) {
            if (!Array.from(Object.keys(items)).includes(item)) {
                delete inventory[item]
                deleted++
            } else if (!inventory[item]) {
                delete inventory[item]
                deleted++
            } else if (inventory[item] == 0) {
                delete inventory[item]
                deleted++
            }
        }

        if (inventory != inventory1) {
            db.prepare("UPDATE economy SET inventory = ? WHERE id = ?").run(JSON.stringify(inventory), user.id)
        }
    }

    if (deleted != 0) {
        logger.info(`${deleted} items deleted from inventories`)
        txt += `\n${deleted.toLocaleString()} items deleted from inventories`
    }

    setTimeout(() => {
        updateCryptoWorth()
    }, 50)

    return txt
}

exports.loadItems = loadItems

loadItems()

function randomOffset() {
    return parseInt(Math.floor(Math.random() * 50000))
}

let padlockPrice = 25000 + randomOffset()
items["padlock"].worth = padlockPrice
logger.info("padlock price updated: $" + padlockPrice.toLocaleString())

setInterval(() => {
    padlockPrice = 25000 + randomOffset()
    items["padlock"].worth = padlockPrice
    logger.info("padlock price updated: $" + padlockPrice.toLocaleString())
}, 3600000)

async function updateCryptoWorth() {
    let res = await fetch("https://api.coindesk.com/v1/bpi/currentprice/USD.json").then((res) => res.json())

    const btcworth = Math.floor(res.bpi.USD.rate_float)

    items["bitcoin"].worth = btcworth
    logger.info("bitcoin worth updated: $" + items["bitcoin"].worth.toLocaleString())

    res = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=ETH").then((res) => res.json())

    const ethWorth = Math.floor(res.data.rates.USD)

    if (!ethWorth) {
        logger.error("INVALID ETH WORTH")
        return logger.error(res)
    }

    items["ethereum"].worth = ethWorth
    logger.info("ethereum worth updated: $" + items["ethereum"].worth.toLocaleString())
}

setInterval(updateCryptoWorth, 1500000)

/**
 *
 * @param {Client} client
 * @param {JSON} vote
 */
async function doVote(client, vote) {
    const { user } = vote

    if (!userExists(user)) {
        logger.warn(`${user} doesnt exist`)
        return
    }

    const now = new Date().getTime()

    const query = db.prepare("SELECT last_vote FROM economy WHERE id = ?").get(user)

    const lastVote = query.lastVote

    if (now - lastVote < 43200000) {
        return logger.error(`${user} already voted`)
    }

    db.prepare("UPDATE economy SET last_vote = ? WHERE id = ?").run(now, user)

    voteCache.set(user, true)

    setTimeout(() => {
        if (voteCache.has(user)) {
            voteCache.delete(user)
        }
    }, 10800)

    let member = await client.users.fetch(user)

    let id = false
    let memberID

    if (!member) {
        member = user
        memberID = user
        id = true
    } else {
        memberID = member.id
    }

    let prestige = getPrestige(memberID)

    if (prestige > 15) prestige = 15

    const amount = 15000 * (prestige + 1)
    const multi = Math.floor((await getMulti(memberID)) * 100)
    const inventory = getInventory(memberID)

    updateBalance(memberID, getBalance(memberID) + amount)
    addKarma(memberID, 10)

    const tickets = getTickets(memberID)

    const prestigeBonus = Math.floor((getPrestige(memberID) > 20 ? 20 : getPrestige(memberID)) / 2.5)
    const premiumBonus = Math.floor(isPremium(memberID) ? getTier(memberID) : 0)
    const karmaBonus = Math.floor(getKarma(memberID) / 100)

    const max = 5 + prestigeBonus + premiumBonus + karmaBonus

    if (tickets.length < max) {
        addTicket(memberID)
    }

    let crateAmount = Math.floor(prestige / 2 + 1)

    if (crateAmount > 5) crateAmount = 5

    if (inventory["vote_crate"]) {
        inventory["vote_crate"] += crateAmount
    } else {
        inventory["vote_crate"] = crateAmount
    }

    setInventory(memberID, inventory)

    logger.success(`vote processed for ${memberID}`)

    if (!id && getDMsEnabled(memberID)) {
        const embed = new CustomEmbed()
            .setColor("#5efb8f")
            .setDescription(
                "you have received the following: \n\n" +
                    `+ $**${amount.toLocaleString()}**\n` +
                    "+ **10** karma\n" +
                    `+ **5**% multiplier, total: **${multi}**%\n` +
                    `+ **${crateAmount}** vote crates` +
                    `${tickets.length < max ? "\n+ **1** lottery ticket" : ""}`
            )

        await member
            .send({ content: "thank you for voting!", embeds: [embed] })
            .then(() => {
                logger.success(`sent vote confirmation to ${member.tag}`)
            })
            .catch(() => {
                logger.warn(`failed to send vote confirmation to ${member.tag}`)
            })
    }
}

exports.doVote = doVote

/**
 * @returns {Number}
 */
function getPadlockPrice() {
    return parseInt(padlockPrice)
}

exports.getPadlockPrice = getPadlockPrice

/**
 * @returns {Number}
 */
function getVoteCacheSize() {
    return voteCache.size
}

exports.getVoteCacheSize = getVoteCacheSize

/**
 *
 * @param {GuildMember} member
 */
function removeFromVoteCache(member) {
    if (voteCache.has(member.user.id)) {
        voteCache.delete(member.user.id)
    }
}

exports.removeFromVoteCache = removeFromVoteCache

function hasVoted(member) {
    let id = member

    if (member.user) id = member.user.id

    if (voteCache.has(id)) {
        return voteCache.get(id)
    }

    const now = new Date().getTime()

    const query = db.prepare("SELECT last_vote FROM economy WHERE id = ?").get(id)

    const lastVote = query.last_vote

    if (now - lastVote < 43200000) {
        voteCache.set(id, true)

        setTimeout(() => {
            voteCache.delete(id)
        }, 10800000)
        return true
    } else {
        voteCache.set(id, false)

        setTimeout(() => {
            voteCache.delete(id)
        }, 10800000)
        return false
    }
}

exports.hasVoted = hasVoted

/**
 * @param {GuildMember} member
 * @returns {Number}
 */
function getMulti(member) {
    let id = member

    if (member.user) id = member.user.id

    let multi = 0

    const voted = hasVoted(id)

    if (voted) {
        multi += 5
    }

    const prestige = getPrestige(member)

    const prestigeBonus = (prestige > 12 ? 12 : prestige) * 2

    multi += prestigeBonus

    if (isPremium(id)) {
        switch (getTier(id)) {
            case 2:
                multi += 4
                break
            case 3:
                multi += 6
                break
            case 4:
                multi += 10
        }
    }

    multi = Math.floor(multi)

    multi = multi / 100

    return parseFloat(multi.toFixed(2))
}

exports.getMulti = getMulti

/**
 * @returns {Number}
 */
function getUserCount() {
    const query = db.prepare("SELECT id FROM economy").all()

    return query.length
}

exports.getUserCount = getUserCount

/**
 * @param {Guild} guild - guild object to get economy user count of
 */
function getUserCountGuild(guild) {
    let count = 0

    const query = db.prepare("SELECT id FROM economy").all()

    for (const user of query) {
        if (guild.members.cache.find((member) => member.user.id == user.id)) {
            count++
        }
    }

    return count
}

exports.getUserCountGuild = getUserCountGuild

/**
 *
 * @param {GuildMember} member - get balance
 */
function getBalance(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT money FROM economy WHERE id = ?").get(id)

    return parseInt(query.money)
}

exports.getBalance = getBalance

/**
 * @param {String} item - get the slots multiplier of an item
 * @returns {Number} multiplier of item
 */
function getMultiplier(item) {
    return multiplier[item]
}

exports.getMultiplier = getMultiplier

/**
 *
 * @param {GuildMember} member
 * @returns {Boolean}
 */
function userExists(member) {
    let id = member

    if (member.user) id = member.user.id

    if (existsCache.has(id)) {
        return existsCache.get(id)
    }

    const query = db.prepare("SELECT id FROM economy WHERE id = ?").get(id)

    if (query) {
        existsCache.set(id, true)
        return true
    } else {
        existsCache.set(id, false)
        return false
    }
}

exports.userExists = userExists

/**
 * @param {GuildMember} member to modify balance of
 * @param {Number} amount to update balance to
 */
function updateBalance(member, amount) {
    let id = member

    if (member.user) id = member.user.id

    const amount1 = parseInt(amount)

    db.prepare("UPDATE economy SET money = ? WHERE id = ?").run(amount1, id)
}

exports.updateBalance = updateBalance

/**
 * @returns {Number} bank balance of user
 * @param {GuildMember} member to get bank balance of
 */
function getBankBalance(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT bank FROM economy WHERE id = ?").get(id)

    return parseInt(query.bank)
}

exports.getBankBalance = getBankBalance

/**
 *
 * @param {GuildMember} member to modify balance of
 * @param {Number} amount to update balance to
 */
function updateBankBalance(member, amount) {
    db.prepare("UPDATE economy SET bank = ? WHERE id = ?").run(parseInt(amount), member.user.id)
}

exports.updateBankBalance = updateBankBalance

/**
 * @returns {Number} xp of user
 * @param {GuildMember} member to get xp of
 */
function getXp(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT xp FROM economy WHERE id = ?").get(id)

    return parseInt(query.xp)
}

exports.getXp = getXp

/**
 *
 * @param {GuildMember} member to modify xp of
 * @param {Number} amount to update xp to
 */
function updateXp(member, amount) {
    if (amount >= 69420) return

    db.prepare("UPDATE economy SET xp = ? WHERE id = ?").run(parseInt(amount), member.user.id)
}

exports.updateXp = updateXp

/**
 * @returns {Number} max balance of user
 * @param {GuildMember} member to get max balance of
 */
function getMaxBankBalance(member) {
    const xp = getXp(member)
    const karma = getKarma(member)
    const constant = 250
    const starting = 15000
    const bonus = xp * constant + (constant / 2) * karma
    const max = bonus + starting

    return max
}

exports.getMaxBankBalance = getMaxBankBalance

/**
 * @returns {Array<String>} global bal top
 * @param {Number} amount of people to pull
 * @param {Client} client
 * @param {Boolean} anon
 */
async function topAmountGlobal(amount, client, anon) {
    const query = db.prepare("SELECT id, money FROM economy").all()

    const userIDs = []
    const balances = new Map()

    for (const user of query) {
        userIDs.push(user.id)
        balances.set(user.id, user.money)
    }

    inPlaceSort(userIDs).desc((i) => balances.get(i))

    let usersFinal = []

    let count = 0

    for (let user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (balances.get(user) != 0) {
            let pos = count + 1

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            const member = await client.users.fetch(user)

            let username = user

            if (member) {
                if (anon) {
                    username = member.username
                } else {
                    username = member.tag
                }
            }

            usersFinal[count] = pos + " **" + username + "** $" + balances.get(user).toLocaleString()
            count++
        }
    }
    return usersFinal
}

exports.topAmountGlobal = topAmountGlobal

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 */
async function topAmount(guild, amount) {
    let members

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const query = db.prepare("SELECT id, money FROM economy").all()

    const userIDs = []
    const balances = new Map()

    for (const user of query) {
        if (members.find((member) => member.user.id == user.id) && user.money != 0) {
            userIDs.push(user.id)
            balances.set(user.id, user.money)
        }
    }

    inPlaceSort(userIDs).desc((i) => balances.get(i))

    let usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        let target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (let user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (balances.get(user) != 0) {
            let pos = count + 1

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            usersFinal[count] =
                pos + " **" + getMemberID(guild, user).user.tag + "** $" + balances.get(user).toLocaleString()
            count++
        }
    }
    return usersFinal
}

exports.topAmount = topAmount

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 * @param {Number} min minimum balance
 */
async function bottomAmount(guild, amount, min = 1) {
    let members

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const query = db.prepare("SELECT id, money FROM economy").all()

    const userIDs = []
    const balances = new Map()

    for (const user of query) {
        if (members.find((member) => member.user.id == user.id) && user.money >= min) {
            userIDs.push(user.id)
            balances.set(user.id, user.money)
        }
    }

    inPlaceSort(userIDs).asc((i) => balances.get(i))

    let usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        let target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (let user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (balances.get(user) != 0) {
            let pos = count + 1

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            usersFinal[count] =
                pos + " **" + getMemberID(guild, user).user.tag + "** $" + balances.get(user).toLocaleString()
            count++
        }
    }

    return usersFinal
}

exports.bottomAmount = bottomAmount

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 */
async function topAmountPrestige(guild, amount) {
    let members

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const query = db.prepare("SELECT id, prestige FROM economy").all()

    const userIDs = []
    const prestiges = new Map()

    for (const user of query) {
        if (members.find((member) => member.user.id == user.id) && user.prestige != 0) {
            userIDs.push(user.id)
            prestiges.set(user.id, user.prestige)
        }
    }

    inPlaceSort(userIDs).desc((i) => prestiges.get(i))

    let usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        let target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (let user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (prestiges.get(user) != 0) {
            let pos = count + 1

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            let thing = ["th", "st", "nd", "rd"]
            let v = prestiges.get(user) % 100
            usersFinal[count] =
                pos +
                " **" +
                getMemberID(guild, user).user.tag +
                "** " +
                prestiges.get(user) +
                (thing[(v - 20) % 10] || thing[v] || thing[0]) +
                " prestige"
            count++
        }
    }
    return usersFinal
}

exports.topAmountPrestige = topAmountPrestige

/**
 *
 * @param {GuildMember} member to create profile for
 */
function createUser(member) {
    let id = member

    if (member.user) id = member.user.id

    if (existsCache.has(id)) {
        existsCache.delete(id)
    }

    if (userExists(id)) {
        db.prepare("DELETE FROM economy WHERE id = ?").run(id)
    }

    db.prepare("INSERT INTO economy (id) VALUES (?)").run(id)
}

exports.createUser = createUser

/**
 * @returns {String}
 */
function winBoard() {
    let lol = ""

    for (let item in multiplier) {
        lol = lol + item + " | " + item + " | " + item + " **||** win: **" + multiplier[item] + "**x\n"
    }

    return lol
}

exports.winBoard = winBoard

/**
 * @returns {Number} formatted bet
 * @param {String} number to format
 */
function formatBet(number) {
    let a = number.toString().toLowerCase().replace("t", "000000000000")
    a = a.replace("b", "000000000")
    a = a.replace("m", "000000")
    a = a.replace("k", "000")

    return a
}

exports.formatBet = formatBet

/**
 * @returns {boolean}
 * @param {GuildMember} member to check
 */
function hasPadlock(member) {
    const query = db.prepare("SELECT padlock FROM economy WHERE id = ?").get(member.user.id)

    return query.padlock == 1 ? true : false
}

exports.hasPadlock = hasPadlock

/**
 *
 * @param {GuildMember} member to update padlock setting of
 * @param {Boolean} setting padlock to true or false
 */
function setPadlock(member, setting) {
    setting = setting ? 1 : 0

    db.prepare("UPDATE economy SET padlock = ? WHERE id = ?").run(setting, member.user.id)
}

exports.setPadlock = setPadlock

/**
 *
 * @param {Number} guildCount guild count
 * @param {Number} shardCount
 */
function updateStats(guildCount, shardCount) {
    topggStats.postStats({
        serverCount: guildCount,
        shardCount: shardCount,
    })

    // fetch("https://discord.bots.gg/bots/678711738845102087/stats", {
    //     method: "POST",
    //     body: JSON.stringify({ shardCount: shardCount, guildCount: guildCount }),
    //     headers: { "Content-Type": "application/json", "Authorization": "removed token" }
    // }) FOR POSTING TO DISCORD.BOTS.GG
}

exports.updateStats = updateStats

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
function getPrestige(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT prestige FROM economy WHERE id = ?").get(id)

    return query.prestige
}

exports.getPrestige = getPrestige

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
function setPrestige(member, amount) {
    db.prepare("UPDATE economy SET prestige = ? WHERE id = ?").run(amount, member.user.id)
}

exports.setPrestige = setPrestige

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
function getPrestigeRequirement(member) {
    const constant = 250
    const extra = getPrestige(member) * constant

    return 500 + extra
}

exports.getPrestigeRequirement = getPrestigeRequirement

/**
 * @returns {Number}
 * @param {Number} xp
 */
function getPrestigeRequirementBal(xp) {
    const constant = 250
    const bonus = xp * constant

    return bonus
}

exports.getPrestigeRequirementBal = getPrestigeRequirementBal

/**
 * @returns {Boolean}
 * @param {GuildMember} member
 */
function getDMsEnabled(member) {
    let id = member

    if (member.user) id = member.user.id

    if (!userExists(id)) createUser(id)

    const query = db.prepare("SELECT dms FROM economy WHERE id = ?").get(id)

    if (query.dms == 1) {
        return true
    } else {
        return false
    }
}

exports.getDMsEnabled = getDMsEnabled

/**
 *
 * @param {GuildMember} member
 * @param {Boolean} value
 */
function setDMsEnabled(member, value) {
    const setting = value ? 1 : 0

    db.prepare("UPDATE economy SET dms = ? WHERE id = ?").run(setting, member.user.id)
}

exports.setDMsEnabled = setDMsEnabled

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
async function calcMaxBet(member) {
    const base = 100000
    const voted = hasVoted(member)
    const bonus = 50000

    let total = base

    if (voted) {
        total += 50000
    }

    const prestige = getPrestige(member)

    return total + bonus * (prestige > 15 ? 15 : prestige)
}

exports.calcMaxBet = calcMaxBet

/**
 * @returns {JSON}
 * @param {GuildMember} member
 * @param {String} member
 */
function getWorkers(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT workers FROM economy WHERE id = ?").get(id)

    return JSON.parse(query.workers)
}

exports.getWorkers = getWorkers

/**
 *
 * @param {GuildMember} member
 * @param {String} id
 * @returns {Worker}
 */
function getWorker(member, id) {
    let memberID = member
    if (member.user) memberID = member.user.id

    const query = db.prepare("SELECT workers FROM economy WHERE id = ?").get(memberID)

    return JSON.parse(query.workers)[id]
}

exports.getWorker = getWorker

/**
 *
 * @param {GuildMember} member
 * @param {Number} id
 * @returns
 */
function addWorker(member, id) {
    let memberID = member
    if (member.user) memberID = member.user.id

    const workers = getAllWorkers()

    let worker = workers.get(id)

    if (!worker) return

    worker = new worker()

    const memberWorkers = getWorkers(member)

    memberWorkers[id] = worker

    db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(memberWorkers), memberID)
}

exports.addWorker = addWorker

function emptyWorkersStored(member) {
    let memberID = member
    if (member.user) memberID = member.user.id

    const workers = getWorkers(memberID)

    for (let worker of Object.keys(workers)) {
        worker = workers[worker]

        worker.stored = 0

        workers[worker.id] = worker
    }

    db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(workers), memberID)
}

exports.emptyWorkersStored = emptyWorkersStored

/**
 *
 * @param {GuildMember} member
 * @param {String} id
 */
function upgradeWorker(member, id) {
    let memberID = member
    if (member.user) memberID = member.user.id

    const workers = getWorkers(memberID)

    let worker = workers[id]

    worker = Worker.fromJSON(worker)

    worker.upgrade()

    workers[id] = worker

    db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(workers), memberID)
}

exports.upgradeWorker = upgradeWorker

function isEcoBanned(id) {
    if (banned.banned.indexOf(id) != -1) {
        return true
    } else {
        return false
    }
}

exports.isEcoBanned = isEcoBanned

function toggleBan(id) {
    if (banned.banned.indexOf(id) != -1) {
        banned.banned.splice(banned.banned.indexOf(id), 1)
    } else {
        banned.banned.push(id)
    }

    const banned1 = JSON.parse(fs.readFileSync("./utils/economy/ban.json"))

    if (JSON.stringify(banned) != JSON.stringify(banned1)) {
        fs.writeFile("./utils/economy/ban.json", JSON.stringify(banned), (err) => {
            if (err) {
                return logger.error(err)
            }
            logger.info("banned data saved")
        })
    }
}

exports.toggleBan = toggleBan

/**
 *
 * @returns {{ deleted: Number, updated: Number }}
 */
function reset() {
    const query = db.prepare("SELECT * FROM economy").all()

    for (const user of query) {
        let prestige = user.prestige
        let lastVote = user.last_vote
        let inventory = JSON.parse(user.inventory)
        const dms = user.dms

        if (!inventory) inventory = {}

        if (Array.from(Object.keys(inventory)).length == 0) {
            inventory = undefined
        } else {
            for (let item of Array.from(Object.keys(inventory))) {
                if (items[item].role != "collectable") {
                    delete inventory[item]
                }
            }
        }

        db.prepare(
            "UPDATE economy SET money = 500, bank = 4500, xp = 0, prestige = ?, padlock = 0, dms = ?, last_vote = ?, inventory = ?, workers = '{}' WHERE id = ?"
        ).run(prestige, dms, lastVote, JSON.stringify(inventory), user.id)

        logger.info("updated " + user.id)
    }
    stats = {}
}

exports.reset = reset

/**
 * @returns {StatsProfile}
 * @param {GuildMember} member
 */
function getStats(member) {
    let id = member

    if (member.user) {
        id = member.user.id
    }

    const query = db.prepare("SELECT * FROM economy_stats WHERE id = ?").run(id)

    return new StatsProfile(query)
}

exports.getStats = getStats

function hasStatsProfile(member) {
    if (stats[member.user.id]) {
        return true
    } else {
        return false
    }
}

exports.hasStatsProfile = hasStatsProfile

function createStatsProfile(member) {
    let id = member

    if (member.user) {
        id = member.user.id
    }

    stats[id] = {
        gamble: {},
        items: {},
        rob: {
            wins: 0,
            lose: 0,
        },
    }
}

exports.createStatsProfile = createStatsProfile

/**
 *
 * @param {GuildMember} member
 * @param {String} game
 * @param {Boolean} win
 */
function addGamble(member, game, win) {
    if (!hasStatsProfile(member)) createStatsProfile(member)

    if (stats[member.user.id].gamble[game]) {
        if (win) {
            stats[member.user.id].gamble[game].wins++
        } else {
            stats[member.user.id].gamble[game].lose++
        }
    } else {
        if (win) {
            stats[member.user.id].gamble[game] = {
                wins: 1,
                lose: 0,
            }
        } else {
            stats[member.user.id].gamble[game] = {
                wins: 0,
                lose: 1,
            }
        }
    }
}

exports.addGamble = addGamble

/**
 *
 * @param {GuildMember} member
 * @param {Boolean} win
 */
function addRob(member, win) {
    if (!hasStatsProfile(member)) createStatsProfile(member)

    if (win) {
        stats[member.user.id].rob.wins++
    } else {
        stats[member.user.id].rob.lose++
    }
}

exports.addRob = addRob

/**
 *
 * @param {GuildMember} member
 */
function addItemUse(member, item) {
    if (!hasStatsProfile(member)) createStatsProfile(member)

    if (!stats[member.user.id].items) stats[member.user.id].items = {} // remove after season 1

    if (stats[member.user.id].items[item]) {
        stats[member.user.id].items[item]++
    } else {
        stats[member.user.id].items[item] = 1
    }
}

exports.addItemUse = addItemUse

/**
 *
 * @param {GuildMember} member
 * @returns
 */
function getInventory(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT inventory FROM economy WHERE id = ?").get(id)

    if (!query.inventory) {
        db.prepare("UPDATE economy SET inventory = '{}' WHERE id = ?").run(id)
        return {}
    }

    return JSON.parse(query.inventory)
}

exports.getInventory = getInventory

/**
 *
 * @param {GuildMember} member
 * @param {Object} inventory
 */
function setInventory(member, inventory) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("UPDATE economy SET inventory = ? WHERE id = ?").run(JSON.stringify(inventory), id)
}

exports.setInventory = setInventory

function getItems() {
    return items
}

exports.getItems = getItems

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
function getMaxBitcoin(member) {
    const base = 2

    const prestige = getPrestige(member)

    const prestigeBonus = 5 * (prestige > 15 ? 15 : prestige)

    let xpBonus = 1 * Math.floor(getXp(member) / 100)

    if (xpBonus > 5) xpBonus = 5

    return base + prestigeBonus + xpBonus
}

exports.getMaxBitcoin = getMaxBitcoin

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
function getMaxEthereum(member) {
    return getMaxBitcoin(member) * 10
}

exports.getMaxEthereum = getMaxEthereum

/**
 *
 * @param {GuildMember} member
 */
function deleteUser(member) {
    let id = member

    if (member.user) id = member.user.id

    if (existsCache.has(id)) {
        existsCache.delete(id)
    }

    db.prepare("DELETE FROM economy WHERE id = ?").run(id)
}

exports.deleteUser = deleteUser

/**
 *
 * @param {GuildMember} member
 * @returns {Array<{ user_id: string, id: number }>}
 */
function getTickets(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT * FROM lottery_tickets WHERE user_id = ?").all(id)

    return query
}

exports.getTickets = getTickets

/**
 *
 * @param {GuildMember} member
 */
function addTicket(member) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("INSERT INTO lottery_tickets (user_id) VALUES (?)").run(id)

    if (!member.user) return

    if (lotteryHookQueue.has(member.user.username)) {
        lotteryHookQueue.set(member.user.username, lotteryHookQueue.get(member.user.username) + 1)
    } else {
        lotteryHookQueue.set(member.user.username, 1)
    }
}

exports.addTicket = addTicket

/**
 *
 * @param {Client} client
 */
async function doLottery(client) {
    logger.info("performing lottery..")
    const tickets = db.prepare("SELECT * FROM lottery_tickets").all()

    if (tickets.length < 10) {
        logger.info(`${tickets.length} tickets were bought ): maybe next week you'll have something to live for`)

        const embed = new CustomEmbed()

        embed.setTitle("lottery cancelled")
        embed.setDescription(
            `the lottery has been cancelled as only **${tickets.length}** were bought ):\n\nthese tickets will remain and the lottery will happen next week`
        )
        embed.setColor("#111111")

        return lotteryHook.send({ embeds: [embed] })
    }

    const total = Math.floor(tickets.length * lotteryTicketPrice * 0.9)

    /**
     * @type {Array<{ user_id: string, id: number }>}
     */
    const shuffledTickets = shuffleArray(tickets)

    let chosen
    let user

    while (!user) {
        chosen = shuffledTickets[Math.floor(Math.random() * shuffledTickets.length)]

        logger.info(`winner: ${chosen.user_id} with ticket #${chosen.id}`)

        user = await client.users.fetch(chosen.user_id)
    }

    logger.success(`winner: ${user.tag} (${user.id}) with ticket #${chosen.id}`)

    updateBalance(user.id, getBalance(user.id) + total)

    const embed = new CustomEmbed()

    embed.setTitle("lottery winner")
    embed.setDescription(
        `**${user.username}** has won the lottery with ticket #${chosen.id}!!\n\n` +
            `they have won a total of $**${total.toLocaleString()}**`
    )
    embed.setFooter(`a total of ${tickets.length.toLocaleString()} tickets were bought`)
    embed.setColor("#111111")

    await lotteryHook.send({ embeds: [embed] })

    if (getDMsEnabled(user.id)) {
        embed.setTitle("you have won the lottery!")
        embed.setDescription(
            `you have won a total of $**${total.toLocaleString()}**\n\nyour winning ticket was #${chosen.id}`
        )
        embed.setColor("#111111")

        await user
            .send({ embeds: [embed] })
            .then(() => {
                logger.success("sent notification to winner")
            })
            .catch(() => {
                logger.warn("failed to send notification to winner")
            })
    }

    const { changes } = db.prepare("DELETE FROM lottery_tickets").run()

    logger.info(`${changes.toLocaleString()} tickets deleted from database`)
}

/**
 *
 * @param {Client} client
 */
function runLotteryInterval(client) {
    const now = new Date()
    const saturday = new Date()
    saturday.setDate(now.getDate() + ((6 - 1 - now.getDay() + 7) % 7) + 1)
    saturday.setHours(0, 0, 0, 0)

    const needed = saturday.getTime() - now.getTime()

    setTimeout(() => {
        doLottery(client)
        setInterval(() => {
            doLottery(client)
        }, 86400 * 1000 * 7)
    }, needed)

    logger.auto(`lottery will run in ${MStoTime(needed)}`)
}

exports.runLotteryInterval = runLotteryInterval

/**
 *
 * @param {GuildMember} member
 * @param {JSON} item
 * @returns {string}
 */
function openCrate(member, item) {
    const inventory = getInventory(member)
    const items = getItems()

    const crateItems = [
        "money:10000",
        "money:15000",
        "money:20000",
        "money:50000",
        "money:100000",
        "xp:5",
        "xp:10",
        "xp:15",
        "xp:25",
        "xp:50",
    ]

    for (const i of Array.from(Object.keys(items))) {
        crateItems.push(i)
    }

    inventory[item.id] -= 1

    if (inventory[item.id] == 0) {
        delete inventory[item.id]
    }

    setInventory(member, inventory)

    let times = 2
    const names = []

    if (item.id.includes("vote")) {
        times = 1
    } else if (item.id.includes("69420")) {
        updateBalance(member, getBalance(member) + 69420)
        names.push("$69,420")
    }

    for (let i = 0; i < times; i++) {
        const crateItemsModified = []

        for (const i of crateItems) {
            if (items[i]) {
                if (items[i].rarity == 4) {
                    const chance = Math.floor(Math.random() * 15)
                    if (chance == 4) {
                        crateItemsModified.push(i)
                    }
                } else if (items[i].rarity == 3) {
                    const chance = Math.floor(Math.random() * 3)
                    if (chance == 2) {
                        crateItemsModified.push(i)
                    }
                } else if (items[i].rarity == 2) {
                    crateItemsModified.push(i)
                } else if (items[i].rarity == 1) {
                    crateItemsModified.push(i)
                    crateItemsModified.push(i)
                } else if (items[i].rarity == 0) {
                    crateItemsModified.push(i)
                    crateItemsModified.push(i)
                    crateItemsModified.push(i)
                }
            } else {
                crateItemsModified.push(i)
                crateItemsModified.push(i)
            }
        }

        const chosen = crateItemsModified[Math.floor(Math.random() * crateItemsModified.length)]

        if (chosen == "bitcoin") {
            const owned = inventory["bitcoin"] || 0
            const max = getMaxBitcoin(member)

            if (owned + 1 > max) {
                i--
                continue
            } else {
                if (inventory[chosen]) {
                    inventory[chosen] += 1
                } else {
                    inventory[chosen] = 1
                }
                names.push(`${items[chosen].emoji} ${items[chosen].name}`)
            }
        } else if (chosen == "ethereum") {
            const owned = inventory["ethereum"] || 0
            const max = getMaxEthereum(member)

            if (owned + 1 > max) {
                i--
                continue
            } else {
                if (inventory[chosen]) {
                    inventory[chosen] += 1
                } else {
                    inventory[chosen] = 1
                }
                names.push(`${items[chosen].emoji} ${items[chosen].name}`)
            }
        } else if (chosen.includes("money:") || chosen.includes("xp:")) {
            if (chosen.includes("money:")) {
                const amount = parseInt(chosen.substr(6))

                updateBalance(member, getBalance(member) + amount)
                names.push("$" + amount.toLocaleString())
            } else if (chosen.includes("xp:")) {
                const amount = parseInt(chosen.substr(3))

                updateXp(member, getXp(member) + amount)
                names.push(amount + "xp")
            }
        } else {
            let amount = 1

            if (chosen == "terrible_fishing_rod" || chosen == "terrible_gun" || chosen == "wooden_pickaxe") {
                amount = 5
            } else if (chosen == "fishing_rod" || chosen == "gun" || chosen == "iron_pickaxe") {
                amount = 10
            } else if (chosen == "incredible_fishing_rod" || chosen == "incredible_gun" || chosen == "diamond_pickaxe") {
                amount = 10
            }

            if (inventory[chosen]) {
                inventory[chosen] += amount
            } else {
                inventory[chosen] = amount
            }
            names.push(`${items[chosen].emoji} ${items[chosen].name}`)
        }
    }

    setInventory(member, inventory)

    return names
}

exports.openCrate = openCrate
