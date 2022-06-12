import { GuildMember } from "discord.js"
import ms = require("ms")
import { getDatabase } from "../database/database"
import redis from "../database/redis"
import { MStoTime } from "../functions/date"
import { logger } from "../logger"

const db = getDatabase()

let karmaShop = false

/**
 *
 * @param {GuildMember} member
 * @returns {Number}
 */
export async function getKarma(member: GuildMember | string): Promise<number> {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (await redis.hexists("cache:karma:amount", id)) return parseInt(await redis.hget("cache:karma:amount", id))

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, karma, last_command) VALUES (?, ?, ?)").run(id, 1, Date.now())
        return 1
    } else {
        await redis.hsetnx("cache:karma:amount", id, query.karma)
        return query.karma
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
export async function addKarma(member: GuildMember | string, amount: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (await redis.hexists("cache:karma:amount", id)) redis.hdel("cache:karma:amount", id)

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, karma, last_command) VALUES (?, ?, ?)").run(id, amount + 1, Date.now())
    } else {
        db.prepare("UPDATE karma SET karma = karma + ? WHERE id = ?").run(amount, id)
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
export async function removeKarma(member: GuildMember | string, amount: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (await redis.hexists("cache:karma:amount", id)) redis.hdel("cache:karma:amount", id)

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, karma, last_command) VALUES (?, ?, ?)").run(id, 1, Date.now())
    } else {
        if (amount > query.karma) {
            amount = query.karma - 1
        }
        db.prepare("UPDATE karma SET karma = karma - ? WHERE id = ?").run(amount, id)
    }
}

/**
 *
 * @param {GuildMember} member
 */
export async function updateLastCommand(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    await redis.hset("cache:karma:lastcmd", id, Date.now())

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, last_command) VALUES (?, ?)").run(id, Date.now())
    } else {
        db.prepare("UPDATE karma SET last_command = ? WHERE id = ?").run(Date.now(), id)
    }
}

/**
 *
 * @returns {Boolean}
 */
export function isKarmaShopOpen(): boolean {
    return karmaShop
}

export function openKarmaShop() {
    karmaShop = true
}

export function closeKarmaShop() {
    karmaShop = false
}

/**
 *
 * @param {GuildMember} member
 * @returns {number}
 */
export function getLastCommand(member: GuildMember | string): number {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (lastCommandCache.has(id)) return lastCommandCache.get(id)

    const query = db.prepare("SELECT last_command FROM karma WHERE id = ?").get(id)

    if (!query) {
        lastCommandCache.set(id, 0)
        return 0
    }

    lastCommandCache.set(id, query.last_command)

    return query.last_command
}

function deteriorateKarma() {
    const now = Date.now()

    const threshold = now - ms("16 hours")

    /**
     * @type {Array<{id: String, karma: Number, last_command: Number}>}
     */
    const users: Array<{ id: string; karma: number; last_command: number }> = db
        .prepare("SELECT * FROM karma WHERE last_command < ? AND karma > 1")
        .all(threshold)

    let total = 0

    for (const user of users) {
        let karmaToRemove = 5

        if (now - ms("1 week") > user.last_command) {
            karmaToRemove = 35
        }

        if (now - ms("30 days") > user.last_command) {
            karmaToRemove = 100
        }

        if (now - ms("90 days") > user.last_command) {
            karmaToRemove = 69420
        }

        if (karmaToRemove > user.karma) {
            karmaToRemove = user.karma - 1
        }

        total += karmaToRemove

        if (karmaCache.has(user.id)) karmaCache.delete(user.id)

        db.prepare("UPDATE karma SET karma = karma - ? WHERE id = ?").run(karmaToRemove, user.id)
    }

    logger.log({
        level: "auto",
        message: `${total} total karma deteriorated`,
    })
}

// prettier-ignore
(() => {
    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000).getTime()

    setTimeout(async () => {
        setInterval(() => {
            deteriorateKarma()
        }, 86400000)
        deteriorateKarma()
    }, needed - now.getTime())

    logger.log({
        level: "auto",
        message: `karma deterioration will run in ${MStoTime(needed - now.getTime())}`
    })
})()
