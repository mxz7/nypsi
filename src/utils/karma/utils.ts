import { GuildMember } from "discord.js"
import { getDatabase } from "../database/database"
import { logger } from "../logger"
import { MStoTime } from "../utils"

const db = getDatabase()

let karmaShop = false

/**
 *
 * @param {GuildMember} member
 * @returns {Number}
 */
export function getKarma(member: GuildMember | string): number {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, karma, last_command) VALUES (?, ?, ?)").run(id, 1, Date.now())
        return 1
    } else {
        return query.karma
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
export function addKarma(member: GuildMember | string, amount: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

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
export function removeKarma(member: GuildMember | string, amount: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

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
export function updateLastCommand(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

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

    const query = db.prepare("SELECT last_command FROM karma WHERE id = ?").get(id)

    return query.last_command
}

function deteriorateKarma() {
    const now = Date.now()

    const threshold = now - 43200000

    /**
     * @type {Array<{id: String, karma: Number, last_command: Number}>}
     */
    const users: Array<{ id: string; karma: number; last_command: number }> = db
        .prepare("SELECT * FROM karma WHERE last_command < ?")
        .all(threshold)

    let total = 0

    for (const user of users) {
        let karmaToRemove = 5

        if (now - 604800000 > user.last_command) {
            karmaToRemove = 35
        }

        if (karmaToRemove > user.karma) {
            karmaToRemove = user.karma - 1
        }

        total += karmaToRemove

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
