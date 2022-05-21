import { getDatabase } from "../database/database"
import * as express from "express"
import * as topgg from "@top-gg/sdk"
import { logger } from "../logger"
import { EconomyProfile, Item, LotteryTicket } from "../models/Economy"
import { Client, Collection, Guild, GuildMember, User, WebhookClient } from "discord.js"
import { CustomEmbed } from "../models/EmbedBuilders"
import * as fs from "fs"
import { addKarma, getKarma } from "../karma/utils"
import { getTier, isPremium } from "../premium/utils"
import { inPlaceSort } from "fast-sort"
import { Constructor, getAllWorkers, Worker } from "./workers"
import { StatsProfile } from "../models/StatsProfile"
import * as shufflearray from "shuffle-array"
import fetch from "node-fetch"
import workerSort from "../workers/sort"
import { MStoTime } from "../functions/date"
import ms = require("ms")

declare function require(name: string)

const db = getDatabase()

const webhook = new topgg.Webhook("123")
const topggStats = new topgg.Api(process.env.TOPGG_TOKEN)

const app = express()

const voteCache = new Map()
const existsCache = new Map()
const bannedCache = new Map()
const guildExistsCache = new Map()
const guildUserCache = new Map()

app.post(
    "/dblwebhook",
    webhook.listener((vote) => {
        logger.info(`received vote: ${vote.user}`)
        const { onVote } = require("../../nypsi")
        onVote(vote)
    })
)

app.listen(5000)

setInterval(() => {
    const query = db.prepare("SELECT id, workers FROM economy WHERE workers != '{}'").all()

    for (const user of query) {
        const workers = JSON.parse(user.workers)

        for (const w of Object.keys(workers)) {
            const worker: any = workers[w]

            if (worker.stored < worker.maxStorage) {
                if (worker.stored + worker.perInterval > worker.maxStorage) {
                    worker.stored = worker.maxStorage
                } else {
                    worker.stored += worker.perInterval
                }
            }
        }

        if (workers != JSON.parse(user.workers)) {
            db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(workers), user.id)
        }
    }
}, 5 * 60 * 1000)

let items: { [key: string]: Item }

const lotteryTicketPrice = 15000
/**
 * higher ticket price = more favourable to rich people cus poor people cant buy tickets resulting in less tickets overall
 * the goal is to have more tickets overall for a more random outcome
 */
export { lotteryTicketPrice }

let lotteryHook: WebhookClient

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

        lotteryHookQueue.delete(username)

        if (desc.join("\n").length >= 1500) break
    }

    const embed = new CustomEmbed()

    embed.setColor("#111111")
    embed.setDescription(desc.join("\n"))
    embed.setTimestamp()

    lotteryHook.send({ embeds: [embed] })
}, ms("30 minutes"))

/**
 *
 * @returns {String}
 */
export function loadItems(): string {
    let txt = ""

    const b: any = fs.readFileSync("./data/items.json")

    items = JSON.parse(b)

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

loadItems()

function randomOffset() {
    return Math.floor(Math.random() * 50000)
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
export async function doVote(client: Client, vote: topgg.WebhookPayload) {
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

    let member: User | string = await client.users.fetch(user)

    let id = false
    let memberID: string

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
    const multi = Math.floor(getMulti(memberID) * 100)
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

    logger.log({
        level: "success",
        message: `vote processed for ${memberID} ${member instanceof User ? `(${member.tag})` : ""}`,
    })

    if (!id && getDMsEnabled(memberID) && member instanceof User) {
        const embed = new CustomEmbed()
            .setColor("#5efb8f")
            .setDescription(
                "you have received the following: \n\n" +
                    `+ $**${amount.toLocaleString()}**\n` +
                    "+ **10** karma\n" +
                    `+ **3**% multiplier, total: **${multi}**%\n` +
                    `+ **${crateAmount}** vote crates` +
                    `${tickets.length < max ? "\n+ **1** lottery ticket" : ""}`
            )

        await member
            .send({ content: "thank you for voting!", embeds: [embed] })
            .then(() => {
                if (member instanceof User) {
                    logger.log({
                        level: "success",
                        message: `sent vote confirmation to ${member.tag}`,
                    })
                }
            })
            .catch(() => {
                if (member instanceof User) {
                    logger.warn(`failed to send vote confirmation to ${member.tag}`)
                }
            })
    }
}

/**
 * @returns {Number}
 */
export function getPadlockPrice(): number {
    return padlockPrice
}

/**
 * @returns {Number}
 */
export function getVoteCacheSize(): number {
    return voteCache.size
}

/**
 *
 * @param {GuildMember} member
 */
export function removeFromVoteCache(member: GuildMember) {
    if (voteCache.has(member.user.id)) {
        voteCache.delete(member.user.id)
    }
}

export function hasVoted(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

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

/**
 * @param {GuildMember} member
 * @returns {Number}
 */
export function getMulti(member: GuildMember | string): number {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    let multi = 0

    const voted = hasVoted(id)

    if (voted) {
        multi += 3
    }

    const prestige = getPrestige(member)

    const prestigeBonus = (prestige > 10 ? 10 : prestige) * 2

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

    const guild = getGuildByUser(id)

    if (guild) {
        multi += guild.level - 1
    }

    multi = Math.floor(multi)

    multi = multi / 100

    return parseFloat(multi.toFixed(2))
}

/**
 * @returns {Number}
 */
export function getUserCount(): number {
    const query = db.prepare("SELECT id FROM economy").all()

    return query.length
}

/**
 * @param {Guild} guild - guild object to get economy user count of
 */
export function getUserCountGuild(guild: Guild) {
    let count = 0

    const query = db.prepare("SELECT id FROM economy").all()

    for (const user of query) {
        if (guild.members.cache.find((member) => member.user.id == user.id)) {
            count++
        }
    }

    return count
}

/**
 *
 * @param {GuildMember} member - get balance
 */
export function getBalance(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT money FROM economy WHERE id = ?").get(id)

    return parseInt(query.money)
}

/**
 *
 * @param {GuildMember} member
 * @returns {Boolean}
 */
export function userExists(member: GuildMember | string): boolean {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

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

/**
 * @param {GuildMember} member to modify balance of
 * @param {Number} amount to update balance to
 */
export function updateBalance(member: GuildMember | string, amount: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const amount1 = amount

    db.prepare("UPDATE economy SET money = ? WHERE id = ?").run(amount1, id)
}

/**
 * @returns {Number} bank balance of user
 * @param {GuildMember} member to get bank balance of
 */
export function getBankBalance(member: GuildMember): number {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT bank FROM economy WHERE id = ?").get(id)

    return parseInt(query.bank)
}

/**
 *
 * @param {GuildMember} member to modify balance of
 * @param {Number} amount to update balance to
 */
export function updateBankBalance(member: GuildMember, amount: number) {
    db.prepare("UPDATE economy SET bank = ? WHERE id = ?").run(amount, member.user.id)
}

/**
 * @returns {Number} xp of user
 * @param {GuildMember} member to get xp of
 */
export function getXp(member: GuildMember): number {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT xp FROM economy WHERE id = ?").get(id)

    return parseInt(query.xp)
}

/**
 *
 * @param {GuildMember} member to modify xp of
 * @param {Number} amount to update xp to
 */
export function updateXp(member: GuildMember, amount: number) {
    if (amount >= 69420) return

    db.prepare("UPDATE economy SET xp = ? WHERE id = ?").run(amount, member.user.id)
}

/**
 * @returns {Number} max balance of user
 * @param {GuildMember} member to get max balance of
 */
export function getMaxBankBalance(member: GuildMember): number {
    const xp = getXp(member)
    const constant = 550
    const starting = 15000
    const bonus = xp * constant
    const max = bonus + starting

    return max
}

/**
 * @returns {Array<String>} global bal top
 * @param {Number} amount of people to pull
 * @param {Client} client
 * @param {Boolean} anon
 */
export async function topAmountGlobal(amount: number, client: Client, anon: boolean): Promise<Array<string>> {
    const query = db.prepare("SELECT id, money FROM economy WHERE money > 1000").all()

    const userIDs = []
    const balances = new Map()

    for (const user of query) {
        userIDs.push(user.id)
        balances.set(user.id, user.money)
    }

    inPlaceSort(userIDs).desc((i) => balances.get(i))

    const usersFinal = []

    let count = 0

    for (const user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (balances.get(user) != 0) {
            let pos: number | string = count + 1

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

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 */
export async function topAmount(guild: Guild, amount: number): Promise<Array<string>> {
    let members: Collection<string, GuildMember>

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const query = db.prepare("SELECT id, money FROM economy WHERE money > 1000").all()

    let userIDs = []
    const balances = new Map()

    for (const user of query) {
        if (members.has(user.id)) {
            userIDs.push(user.id)
            balances.set(user.id, user.money)
        }
    }

    if (userIDs.length > 500) {
        userIDs = await workerSort(userIDs, balances)
        userIDs.reverse()
    } else {
        inPlaceSort(userIDs).desc((i) => balances.get(i))
    }

    const usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        const target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (const user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (balances.get(user) != 0) {
            let pos: number | string = count + 1

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

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 * @param {Number} min minimum balance
 */
export async function bottomAmount(guild: Guild, amount: number): Promise<Array<string>> {
    let members: Collection<string, GuildMember>

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const query = db.prepare("SELECT id, money FROM economy WHERE money > 1000").all()

    let userIDs = []
    const balances = new Map()

    for (const user of query) {
        if (members.find((member) => member.user.id == user.id)) {
            userIDs.push(user.id)
            balances.set(user.id, user.money)
        }
    }

    if (userIDs.length > 500) {
        userIDs = await workerSort(userIDs, balances)
    } else {
        inPlaceSort(userIDs).asc((i) => balances.get(i))
    }

    const usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        const target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (const user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (balances.get(user) != 0) {
            let pos: number | string = count + 1

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

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 */
export async function topAmountPrestige(guild: Guild, amount: number): Promise<Array<string>> {
    let members: Collection<string, GuildMember>

    if (guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const query = db.prepare("SELECT id, prestige FROM economy WHERE prestige > 0").all()

    let userIDs = []
    const prestiges = new Map()

    for (const user of query) {
        if (members.find((member) => member.user.id == user.id)) {
            userIDs.push(user.id)
            prestiges.set(user.id, user.prestige)
        }
    }

    if (userIDs.length > 500) {
        userIDs = await workerSort(userIDs, prestiges)
    } else {
        inPlaceSort(userIDs).desc((i) => prestiges.get(i))
    }

    const usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        const target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (const user of userIDs) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (prestiges.get(user) != 0) {
            let pos: string | number = count + 1

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            const thing = ["th", "st", "nd", "rd"]
            const v = prestiges.get(user) % 100
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

/**
 *
 * @param {GuildMember} member to create profile for
 */
export function createUser(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (existsCache.has(id)) {
        existsCache.delete(id)
    }

    db.prepare("INSERT INTO economy (id, money, bank) VALUES (?, ?, ?)").run(id, 1000, 4000)
}

/**
 * @returns {Number} formatted bet
 * @param {String} number to format
 */
export function formatBet(bet: string | number, member: GuildMember): number | void {
    const maxBet = calcMaxBet(member)

    if (bet.toString().toLowerCase() == "all") {
        bet = getBalance(member)
        if (bet > maxBet) {
            bet = maxBet
        }
    } else if (bet.toString().toLowerCase() == "max") {
        bet = maxBet
    } else if (bet.toString().toLowerCase() == "half") {
        bet = Math.floor(getBalance(member) / 2)
    }

    const formatted = formatNumber(bet.toString())

    if (formatted) {
        bet = formatted
    } else {
        return null
    }

    if (bet <= 0) return null

    return bet
}

export function formatNumber(number: string): number | void {
    number = number.toString().toLowerCase().replace("t", "000000000000")
    number = number.replace("b", "000000000")
    number = number.replace("m", "000000")
    number = number.replace("k", "000")

    if (isNaN(parseInt(number))) return null

    return Math.floor(parseInt(number))
}

/**
 * @returns {boolean}
 * @param {GuildMember} member to check
 */
export function hasPadlock(member: GuildMember): boolean {
    const query = db.prepare("SELECT padlock FROM economy WHERE id = ?").get(member.user.id)

    return query.padlock == 1 ? true : false
}

/**
 *
 * @param {GuildMember} member to update padlock setting of
 * @param {Boolean} setting padlock to true or false
 */
export function setPadlock(member: GuildMember, setting: boolean | number) {
    setting = setting ? 1 : 0

    db.prepare("UPDATE economy SET padlock = ? WHERE id = ?").run(setting, member.user.id)
}

/**
 *
 * @param {Number} guildCount guild count
 * @param {Number} shardCount
 */
export function updateStats(guildCount: number, shardCount: number) {
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

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
export function getPrestige(member: GuildMember | string): number {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT prestige FROM economy WHERE id = ?").get(id)

    return query.prestige
}

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
export function setPrestige(member: GuildMember, amount: number) {
    db.prepare("UPDATE economy SET prestige = ? WHERE id = ?").run(amount, member.user.id)
}

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
export function getPrestigeRequirement(member: GuildMember): number {
    const constant = 250
    const extra = getPrestige(member) * constant

    return 500 + extra
}

/**
 * @returns {Number}
 * @param {Number} xp
 */
export function getPrestigeRequirementBal(xp: number): number {
    const constant = 500
    const bonus = xp * constant

    return bonus
}

/**
 * @returns {Boolean}
 * @param {GuildMember} member
 */
export function getDMsEnabled(member: GuildMember | string): boolean {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (!userExists(id)) createUser(id)

    const query = db.prepare("SELECT dms FROM economy WHERE id = ?").get(id)

    if (query.dms == 1) {
        return true
    } else {
        return false
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {Boolean} value
 */
export function setDMsEnabled(member: GuildMember, value: boolean) {
    const setting = value ? 1 : 0

    db.prepare("UPDATE economy SET dms = ? WHERE id = ?").run(setting, member.user.id)
}

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
export function calcMaxBet(member: GuildMember): number {
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

/**
 * @returns {JSON}
 * @param {GuildMember} member
 * @param {String} member
 */
export function getWorkers(member: GuildMember | string): any {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT workers FROM economy WHERE id = ?").get(id)

    return JSON.parse(query.workers)
}

/**
 *
 * @param {GuildMember} member
 * @param {String} id
 * @returns {Worker}
 */
export function getWorker(member: GuildMember, id: string): Worker {
    let memberID: string
    if (member instanceof GuildMember) {
        memberID = member.user.id
    } else {
        memberID = member
    }

    const query = db.prepare("SELECT workers FROM economy WHERE id = ?").get(memberID)

    return JSON.parse(query.workers)[id]
}

/**
 *
 * @param {GuildMember} member
 * @param {Number} id
 * @returns
 */
export function addWorker(member: GuildMember, id: number) {
    let memberID: string
    if (member instanceof GuildMember) {
        memberID = member.user.id
    } else {
        memberID = member
    }

    const workers = getAllWorkers()

    let worker: Constructor<Worker> | Worker = workers.get(id)

    if (!worker) return

    worker = new worker()

    const memberWorkers = getWorkers(member)

    memberWorkers[id] = worker

    db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(memberWorkers), memberID)
}

export function emptyWorkersStored(member: GuildMember | string) {
    let memberID: string
    if (member instanceof GuildMember) {
        memberID = member.user.id
    } else {
        memberID = member
    }

    const workers = getWorkers(memberID)

    for (const w of Object.keys(workers)) {
        const worker: Worker = workers[w]

        worker.stored = 0

        workers[worker.id] = worker
    }

    db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(workers), memberID)
}

/**
 *
 * @param {GuildMember} member
 * @param {String} id
 */
export function upgradeWorker(member: GuildMember | string, id: string) {
    let memberID: string
    if (member instanceof GuildMember) {
        memberID = member.user.id
    } else {
        memberID = member
    }

    const workers = getWorkers(memberID)

    let worker = workers[id]

    worker = Worker.fromJSON(worker)

    worker.upgrade()

    workers[id] = worker

    db.prepare("UPDATE economy SET workers = ? WHERE id = ?").run(JSON.stringify(workers), memberID)
}

export function isEcoBanned(id: string) {
    if (bannedCache.has(id)) {
        return bannedCache.get(id)
    } else {
        const query = db.prepare("SELECT banned FROM economy WHERE id = ?").get(id)

        if (!query) {
            bannedCache.set(id, false)
            return false
        }

        if (query.banned) {
            bannedCache.set(id, true)
            return true
        } else {
            bannedCache.set(id, false)
            return false
        }
    }
}

export function toggleBan(id: string) {
    if (isEcoBanned(id)) {
        db.prepare("UPDATE economy SET banned = 0 WHERE id = ?").run(id)
    } else {
        db.prepare("UPDATE economy SET banned = 1 WHERE id = ?").run(id)
    }

    bannedCache.delete(id)
}

export function reset() {
    const query: EconomyProfile[] = db.prepare("SELECT * FROM economy").all()

    let updated = 0
    let deleted = 0

    for (const user of query) {
        const prestige = user.prestige
        const lastVote = user.last_vote
        let inventory = JSON.parse(user.inventory)
        const dms = user.dms

        if (!inventory) inventory = {}

        if (Array.from(Object.keys(inventory)).length == 0) {
            inventory = undefined
        } else {
            for (const item of Array.from(Object.keys(inventory))) {
                if (items[item].role != "collectable") {
                    delete inventory[item]
                }
            }
        }

        if (!inventory && prestige == 0 && user.money < 10000 && user.xp < 300) {
            db.prepare("DELETE FROM economy WHERE id = ?").run(user.id)
            deleted++
        } else {
            db.prepare(
                "UPDATE economy SET money = 1000, bank = 4000, xp = 0, prestige = ?, padlock = 0, dms = ?, last_vote = ?, inventory = ?, workers = '{}' WHERE id = ?"
            ).run(prestige, dms, lastVote, JSON.stringify(inventory), user.id)
            updated++
        }
    }
    db.prepare("DELETE FROM economy_stats")

    return { updated: updated, deleted: deleted }
}

/**
 * @returns {StatsProfile}
 * @param {GuildMember} member
 */
export function getStats(member: GuildMember): StatsProfile {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT * FROM economy_stats WHERE id = ?").all(id)

    return new StatsProfile(query)
}

/**
 *
 * @param {GuildMember} member
 * @param {String} game
 * @param {Boolean} win
 */
export function addGamble(member: GuildMember, game: string, win: boolean) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT id FROM economy_stats WHERE id = ? AND type = ?").get(id, game)

    if (query) {
        if (win) {
            db.prepare("UPDATE economy_stats SET win = win + 1 WHERE id = ? AND type = ?").run(id, game)
        } else {
            db.prepare("UPDATE economy_stats SET lose = lose + 1 WHERE id = ? AND type = ?").run(id, game)
        }
    } else {
        if (win) {
            db.prepare("INSERT INTO economy_stats (id, type, win, gamble) VALUES (?, ?, ?, 1)").run(id, game, 1)
        } else {
            db.prepare("INSERT INTO economy_stats (id, type, lose, gamble) VALUES (?, ?, ?, 1)").run(id, game, 1)
        }
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {Boolean} win
 */
export function addRob(member: GuildMember, win: boolean) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT id FROM economy_stats WHERE id = ? AND type = 'rob'").get(id)

    if (query) {
        if (win) {
            db.prepare("UPDATE economy_stats SET win = win + 1 WHERE id = ? AND type = 'rob'").run(id)
        } else {
            db.prepare("UPDATE economy_stats SET lose = lose + 1 WHERE id = ? AND type = 'rob'").run(id)
        }
    } else {
        if (win) {
            db.prepare("INSERT INTO economy_stats (id, type, win) VALUES (?, ?, ?)").run(id, "rob", 1)
        } else {
            db.prepare("INSERT INTO economy_stats (id, type, lose) VALUES (?, ?, ?)").run(id, "rob", 1)
        }
    }
}

/**
 *
 * @param {GuildMember} member
 */
export function addItemUse(member: GuildMember, item) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT id FROM economy_stats WHERE id = ? AND type = ?").get(id, item)

    if (query) {
        db.prepare("UPDATE economy_stats SET win = win + 1 WHERE id = ? AND type = ?").run(id, item)
    } else {
        db.prepare("INSERT INTO economy_stats (id, type, win) VALUES (?, ?, 1)").run(id, item)
    }
}

/**
 *
 * @param {GuildMember} member
 * @returns
 */
export function getInventory(member: GuildMember | string): { [key: string]: number } {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT inventory FROM economy WHERE id = ?").get(id)

    if (!query.inventory) {
        db.prepare("UPDATE economy SET inventory = '{}' WHERE id = ?").run(id)
        return {}
    }

    return JSON.parse(query.inventory)
}

/**
 *
 * @param {GuildMember} member
 * @param {Object} inventory
 */
export function setInventory(member: GuildMember | string, inventory: object) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }
    db.prepare("UPDATE economy SET inventory = ? WHERE id = ?").run(JSON.stringify(inventory), id)
}

export function getItems(): { [key: string]: Item } {
    return items
}

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
export function getMaxBitcoin(member: GuildMember): number {
    const base = 10

    const prestige = getPrestige(member)

    const prestigeBonus = 5 * (prestige > 15 ? 15 : prestige)

    let xpBonus = 1 * Math.floor(getXp(member) / 100)

    if (xpBonus > 5) xpBonus = 5

    return base + prestigeBonus + xpBonus
}

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
export function getMaxEthereum(member: GuildMember): number {
    return getMaxBitcoin(member) * 10
}

/**
 *
 * @param {GuildMember} member
 */
export function deleteUser(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (existsCache.has(id)) {
        existsCache.delete(id)
    }

    db.prepare("DELETE FROM economy WHERE id = ?").run(id)
}

/**
 *
 * @param {GuildMember} member
 * @returns {Array<{ user_id: string, id: number }>}
 */
export function getTickets(member: GuildMember | string): Array<LotteryTicket> {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query: LotteryTicket[] = db.prepare("SELECT * FROM lottery_tickets WHERE user_id = ?").all(id)

    return query
}

/**
 *
 * @param {GuildMember} member
 */
export function addTicket(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("INSERT INTO lottery_tickets (user_id) VALUES (?)").run(id)

    if (!(member instanceof GuildMember)) return

    if (lotteryHookQueue.has(member.user.username)) {
        lotteryHookQueue.set(member.user.username, lotteryHookQueue.get(member.user.username) + 1)
    } else {
        lotteryHookQueue.set(member.user.username, 1)
    }
}

/**
 *
 * @param {Client} client
 */
async function doLottery(client: Client) {
    logger.info("performing lottery..")
    const tickets: LotteryTicket[] = db.prepare("SELECT * FROM lottery_tickets").all()

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
    const shuffledTickets: Array<{ user_id: string; id: number }> = shufflearray(tickets)

    let chosen: LotteryTicket
    let user: User

    while (!user) {
        chosen = shuffledTickets[Math.floor(Math.random() * shuffledTickets.length)]

        logger.info(`winner: ${chosen.user_id} with ticket #${chosen.id}`)

        user = await client.users.fetch(chosen.user_id)
    }

    logger.log({
        level: "success",
        message: `winner: ${user.tag} (${user.id}) with ticket #${chosen.id}`,
    })

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
                logger.log({
                    level: "success",
                    message: "sent notification to winner",
                })
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
export function runLotteryInterval(client: Client) {
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

    logger.log({
        level: "auto",
        message: `lottery will run in ${MStoTime(needed)}`,
    })
}

/**
 *
 * @param {GuildMember} member
 * @param {JSON} item
 * @returns {string}
 */
export function openCrate(member: GuildMember, item: Item): string[] {
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

export function getRequiredBetForXp(member: GuildMember): number {
    let requiredBet = 1000

    const prestige = getPrestige(member)

    if (prestige > 2) requiredBet = 10000

    requiredBet += prestige * 1000

    return requiredBet
}

export function calcMinimumEarnedXp(member: GuildMember): number {
    let earned = 1
    earned += getPrestige(member)

    if (earned > 7) earned = 7

    return earned
}

export function calcEarnedXp(member: GuildMember, bet: number): number {
    const requiredBet = getRequiredBetForXp(member)

    if (bet < requiredBet) {
        return 0
    }

    let earned = calcMinimumEarnedXp(member)

    const random = Math.floor(Math.random() * 3)

    earned += random

    if (earned > 7) earned = 7

    return earned
}

interface EconomyGuild {
    guild_name: string
    created_at: number
    balance: number
    xp: number
    level: number
    log_channel: string | undefined
    motd: string
    owner: string
    members: EconomyGuildMember[]
}

interface EconomyGuildMember {
    user_id: string
    guild_id: string
    joined_at: number
    contributed_money: number
    contributed_xp: number
    last_known_tag: string
}

export function guildExists(name: string): boolean {
    if (guildExistsCache.has(name)) {
        return guildExistsCache.get(name)
    }

    const query = db.prepare("select guild_name from economy_guild where guild_name = ?").get(name)

    if (!query) {
        return false
    } else {
        return true
    }
}

export function getGuildByName(name: string): EconomyGuild {
    const guild = db.prepare("select * from economy_guild where guild_name = ? collate nocase").get(name)
    const members: EconomyGuildMember[] = db.prepare("select * from economy_guild_members where guild_id = ?").all(name)

    if (!guild) return null

    guild.members = members

    for (const m of members) {
        if (!guildUserCache.has(m.user_id)) {
            guildUserCache.set(m.user_id, m.guild_id)
        }
    }

    return guild
}

export function getGuildByUser(member: GuildMember | string): EconomyGuild | null {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    let guildName: string

    if (guildUserCache.has(id)) {
        guildName = guildUserCache.get(id)

        if (!guildName) return null
    } else {
        const query = db.prepare("select guild_id from economy_guild_members where user_id = ?").get(id)

        if (!query) {
            guildUserCache.set(id, null)
            return null
        }

        guildName = query.guild_id
    }

    const guild = db.prepare("select * from economy_guild where guild_name = ?").get(guildName)
    const members = db.prepare("select * from economy_guild_members where guild_id = ?").all(guildName)

    for (const m of members) {
        if (!guildUserCache.has(m.user_id)) {
            guildUserCache.set(m.user_id, m.guild_id)
        }
    }

    guild.members = members

    return guild
}

export function createGuild(name: string, owner: GuildMember) {
    db.prepare("insert into economy_guild (guild_name, created_at, owner) values (?, ?, ?)").run(
        name,
        Date.now(),
        owner.user.id
    )
    db.prepare("insert into economy_guild_members (user_id, guild_id, joined_at, last_known_tag) values (?, ?, ?, ?)").run(
        owner.user.id,
        name,
        Date.now(),
        owner.user.tag
    )

    if (guildUserCache.has(owner.user.id)) {
        guildUserCache.delete(owner.user.id)
    }
}

export function deleteGuild(name: string) {
    const members = getGuildByName(name).members

    for (const m of members) {
        guildUserCache.delete(m.user_id)
    }

    guildExistsCache.delete(name)

    db.prepare("delete from economy_guild_members where guild_id = ?").run(name)
    db.prepare("delete from economy_guild where guild_name = ?").run(name)
}

export function addToGuildBank(name: string, amount: number, member: GuildMember) {
    db.prepare("update economy_guild set balance = balance + ? where guild_name = ?").run(amount, name)
    db.prepare("update economy_guild_members set contributed_money = contributed_money + ? where user_id = ?").run(
        amount,
        member.user.id
    )
}

export function addToGuildXP(name: string, amount: number, member: GuildMember) {
    db.prepare("update economy_guild set xp = xp + ? where guild_name = ?").run(amount, name)
    db.prepare("update economy_guild_members set contributed_xp = contributed_xp + ? where user_id = ?").run(
        amount,
        member.user.id
    )
}

export function getMaxMembersForGuild(name: string) {
    const guild = getGuildByName(name)

    return guild.level * 3
}

export function getRequiredForGuildUpgrade(name: string): { money: number; xp: number } {
    const guild = getGuildByName(name)

    const baseMoney = 1900000 * Math.pow(guild.level, 2)
    const baseXP = 1425 * Math.pow(guild.level, 2)

    const bonusMoney = 100000 * guild.members.length
    const bonusXP = 75 * guild.members.length

    return {
        money: baseMoney + bonusMoney,
        xp: baseXP + bonusXP,
    }
}

export function upgradeGuild(name: string) {
    const required = getRequiredForGuildUpgrade(name)

    db.prepare("update economy_guild set balance = balance - ?, xp = xp - ?, level = level + 1").run(
        required.money,
        required.xp
    )

    const guild = getGuildByName(name)

    for (const m of guild.members) {
        const inventory = getInventory(m.user_id)

        if (inventory["basic_crate"]) {
            inventory["basic_crate"] += 1
        } else {
            inventory["basic_crate"] = 1
        }
    }
}

export function addMember(name: string, member: GuildMember): boolean {
    const guild = getGuildByName(name)

    if (guild.members.length + 1 > getMaxMembersForGuild(guild.guild_name)) {
        return false
    }

    db.prepare("insert into economy_guild_members (user_id, guild_id, joined_at, last_known_tag) values (?, ?, ?, ?)").run(
        member.user.id,
        guild.guild_name,
        Date.now(),
        member.user.tag
    )

    if (guildUserCache.has(member.user.id)) {
        guildUserCache.delete(member.user.id)
    }

    return true
}

export enum RemoveMemberMode {
    ID,
    TAG,
}

export function removeMember(member: string, mode: RemoveMemberMode) {
    if (mode == RemoveMemberMode.ID) {
        db.prepare("delete from economy_guild_members where user_id = ?").run(member)
    } else {
        db.prepare("delete from economy_guild_members where last_known_tag = ?").run(member)
    }

    guildUserCache.clear()
}
