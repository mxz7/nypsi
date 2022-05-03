import { GuildMember } from "discord.js"
import { getDatabase } from "../database/database"
import { logger } from "../logger"
import { PremUser } from "../models/PremStorage"
import { formatDate } from "../utils"

declare function require(name: string)

const db = getDatabase()

const isPremiumCache = new Map()
const tierCache = new Map()
const colorCache = new Map()

setInterval(async () => {
    const now = new Date().getTime()

    const query = db.prepare("SELECT id FROM premium WHERE expire_date <= ?").all(now)

    for (const user of query) {
        expireUser(user.id)
    }
}, 600000)

/**
 * @returns {Boolean}
 * @param {GuildMember} member
 */
export function isPremium(member: GuildMember | string): boolean {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (isPremiumCache.has(id)) {
        return isPremiumCache.get(id)
    }

    const query = db.prepare("SELECT id FROM premium WHERE id = ?").get(id)

    if (query) {
        if (getTier(id) == 0) {
            isPremiumCache.set(id, false)
            return false
        }

        isPremiumCache.set(id, true)
        return true
    } else {
        isPremiumCache.set(id, false)
        return false
    }
}

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
export function getTier(member: GuildMember | string): number {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (tierCache.has(id)) {
        return tierCache.get(id)
    }

    const query = db.prepare("SELECT level FROM premium WHERE id = ?").get(id)

    tierCache.set(id, query.level)

    return query.level
}

/**
 * @param {GuildMember} member
 * @param {Number} level
 */
export function addMember(member: GuildMember | string, level: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const start = new Date().getTime()
    const expire = new Date().setDate(new Date().getDate() + 35)

    db.prepare("INSERT INTO premium (id, level, start_date, expire_date) VALUES (?, ?, ?, ?)").run(id, level, start, expire)

    const profile = getPremiumProfile(id)

    logger.info(`premium level ${level} given to ${id}`)

    const { requestDM } = require("../../nypsi")
    requestDM(
        id,
        `you have been given **${profile.getLevelString()}** membership, this will expire on **${formatDate(
            profile.expireDate
        )}**\n\nplease join the support server if you have any problems, or questions. discord.gg/hJTDNST`
    )

    if (isPremiumCache.has(id)) {
        isPremiumCache.delete(id)
    }

    if (tierCache.has(id)) {
        tierCache.delete(id)
    }
}

/**
 * @returns {PremUser}
 * @param {GuildMember} member
 */
export function getPremiumProfile(member: GuildMember | string): PremUser {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const query = db.prepare("SELECT * FROM premium WHERE id = ?").get(id)

    return createPremUser(query)
}

/**
 * @param {GuildMember} member
 * @param {Number} level
 */
export function setTier(member: GuildMember | string, level: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET level = ? WHERE id = ?").run(level, id)

    logger.info(`premium level updated to ${level} for ${id}`)

    const { requestDM } = require("../../nypsi")
    requestDM(id, `your membership has been updated to **${PremUser.getLevelString(level)}**`)

    if (isPremiumCache.has(id)) {
        isPremiumCache.delete(id)
    }

    if (tierCache.has(id)) {
        tierCache.delete(id)
    }
}

/**
 * @param {GuildMember} member
 * @param {String} color
 */
export function setEmbedColor(member: GuildMember, color: string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET embed_color = ? WHERE id = ?").run(color, id)

    if (colorCache.has(id)) {
        colorCache.delete(id)
    }
}

/**
 * @returns {String}
 * @param {String} member id
 */
export function getEmbedColor(member: string): `#${string}` | "default" {
    if (colorCache.has(member)) {
        return colorCache.get(member)
    }

    const query = db.prepare("SELECT embed_color FROM premium WHERE id = ?").get(member)

    colorCache.set(member, query.embed_color)

    return query.embed_color
}

/**
 * @param {GuildMember} member
 * @param {Date} date
 */
export function setLastDaily(member: GuildMember, date: Date) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET last_daily = ? WHERE id = ?").run(date, id)
}

/**
 * @param {GuildMember} member
 * @param {Date} date
 */
export function setLastWeekly(member: GuildMember, date: Date) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET last_weekly = ? WHERE id = ?").run(date, id)
}

/**
 * @param {GuildMember} member
 * @param {Number} status
 */
export function setStatus(member: GuildMember, status: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET status = ? WHERE id = ?").run(status, id)
}

/**
 * @param {GuildMember} member
 * @param {String} reason
 */
export function setReason(member: GuildMember, reason: string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET revoke_reason = ? WHERE id = ?").run(reason, id)
}

/**
 * @param {GuildMember} member
 * @param {Date} date
 */
export function setStartDate(member: GuildMember, date: Date) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET start_date = ? WHERE id = ?").run(date, id)
}

/**
 * @param {String} member id
 */
export function renewUser(member: string) {
    const profile = getPremiumProfile(member)

    profile.renew()

    db.prepare("UPDATE premium SET expire_date = ? WHERE id = ?").run(profile.expireDate, member)

    const { requestDM } = require("../../nypsi")
    requestDM(member, `your membership has been renewed until **${formatDate(profile.expireDate)}**`)

    if (isPremiumCache.has(member)) {
        isPremiumCache.delete(member)
    }

    if (tierCache.has(member)) {
        tierCache.delete(member)
    }

    if (colorCache.has(member)) {
        colorCache.delete(member)
    }
}

/**
 * @param {String} member id
 */
export async function expireUser(member: string) {
    const profile = getPremiumProfile(member)

    const expire = await profile.expire()

    if (expire == "boost") {
        return renewUser(member)
    }

    db.prepare("DELETE FROM premium WHERE id = ?").run(member)

    if (isPremiumCache.has(member)) {
        isPremiumCache.delete(member)
    }

    if (tierCache.has(member)) {
        tierCache.delete(member)
    }

    if (colorCache.has(member)) {
        colorCache.delete(member)
    }
}

/**
 * @param {String} member id
 * @param {String} reason
 */
export function revokeUser(member: string, reason: string) {
    db.prepare("UPDATE premium SET level = 0, status = 2, revoke_reason = ? WHERE id = ?").run(reason, member)

    const { requestDM } = require("../../nypsi")
    requestDM(member, "your membership has been revoked")
}

/**
 * @returns {Date}
 * @param {String} member id
 */
export function getLastDaily(member: string): number {
    const query = db.prepare("SELECT last_daily FROM premium WHERE id = ?").get(member)

    return query.last_daily
}

/**
 * @returns {Date}
 * @param {String} member id
 */
export function getLastWeekly(member: string): number {
    const query = db.prepare("SELECT last_weekly FROM premium WHERE id = ?").get(member)

    return query.last_weekly
}

/**
 * @returns {{ trigger: String, content: String, owner: String, uses: Number } || null}
 * @param {String} name
 */
export function getCommand(name: string): { trigger: string; content: string; owner: string; uses: number } {
    const query = db.prepare("SELECT * FROM premium_commands WHERE trigger = ?").get(name)

    if (query) {
        if (!isPremium(query.owner)) return null
        return query
    } else {
        return null
    }
}

/**
 *
 * @param {String} id
 * @returns {{ trigger: String, content: String, owner: String, uses: Number }}
 */
export function getUserCommand(id: string): { trigger: string; content: string; owner: string; uses: number } {
    return db.prepare("SELECT * FROM premium_commands WHERE owner = ?").get(id)
}

/**
 *
 * @param {String} id
 * @param {String} trigger
 * @param {String} content
 * @param {Number} uses
 */
export function setCommand(id: string, trigger: string, content: string) {
    const query = db.prepare("SELECT owner FROM premium_commands WHERE owner = ?").get(id)

    if (query) {
        db.prepare("UPDATE premium_commands SET trigger = ?, content = ?, uses = 0 WHERE owner = ?").run(
            trigger,
            content,
            id
        )
    } else {
        db.prepare("INSERT INTO premium_commands (trigger, content, owner, uses) VALUES (?, ?, ?, 0)").run(
            trigger,
            content,
            id
        )
    }
}

export function addUse(id: string) {
    db.prepare("UPDATE premium_commands SET uses = uses + 1 WHERE owner = ?").run(id)
}

/**
 *
 * @param {GuildMember} member
 * @param {number} date
 */
export function setExpireDate(member: GuildMember | string, date: number) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE premium SET expire_date = ? WHERE id = ?").run(date, id)

    const { requestDM } = require("../../nypsi")
    requestDM(id, `your membership will now expire on **${formatDate(date)}**`)
}

export function createPremUser(query: any) {
    return PremUser.fromData({
        id: query.id,
        level: query.level,
        embedColor: query.embed_color,
        lastDaily: query.last_daily,
        lastWeekly: query.last_weekly,
        status: query.status,
        revokeReason: query.revoke_reason,
        startDate: query.start_date,
        expireDate: query.expire_date,
    })
}
