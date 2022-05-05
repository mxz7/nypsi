import { Collection, Guild, GuildMember, Message, User } from "discord.js"
import { inPlaceSort } from "fast-sort"
import fetch from "node-fetch"
import { getDatabase } from "../database/database"
import { cleanString } from "../utils"

const db = getDatabase()
const existsCache = new Set()
const optCache = new Map()
const usernameCache = new Map()
const avatarCache = new Map()
const lastfmUsernameCache = new Map()

const mentionQueue: Array<{ type: string; members: Collection<string, GuildMember>; message: Message; guild: string }> = []

export { mentionQueue }

const deleteQueue: Array<string> = []

export { deleteQueue }

/**
 *
 * @param {GuildMember} member
 */
export function createUsernameProfile(member: GuildMember | User, tag: string, url?: string) {
    const id = member.id

    db.prepare("INSERT INTO usernames_optout (id) VALUES (?)").run(id)
    db.prepare("INSERT INTO usernames (id, value, date) VALUES (?, ?, ?)").run(id, tag, Date.now())
    if (url)
        db.prepare("INSERT INTO usernames (id, value, type, date) VALUES (?, ?, ?, ?)").run(id, url, "avatar", Date.now())
}

export function usernameProfileExists(member: GuildMember | string): boolean {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (existsCache.has(id)) return true

    const query = db.prepare("SELECT id FROM usernames_optout WHERE id = ?").get(id)

    if (query) {
        existsCache.add(id)
        return true
    } else {
        return false
    }
}

export function isTracking(member: GuildMember | string): boolean {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (optCache.has(id)) {
        return optCache.get(id)
    }

    const query = db.prepare("SELECT tracking FROM usernames_optout WHERE id = ?").get(id)

    if (query.tracking == 1) {
        optCache.set(id, true)
        return true
    } else {
        optCache.set(id, false)
        return false
    }
}

export function disableTracking(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE usernames_optout SET tracking = 0 WHERE id = ?").run(id)

    if (optCache.has(id)) {
        optCache.delete(id)
    }
}

export function enableTracking(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("UPDATE usernames_optout SET tracking = 1 WHERE id = ?").run(id)

    if (optCache.has(id)) {
        optCache.delete(id)
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {String} username
 */
export function addNewUsername(member: GuildMember | string, username: string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("INSERT INTO usernames (id, type, value, date) VALUES (?, ?, ?, ?)").run(id, "username", username, Date.now())

    if (usernameCache.has(id)) {
        usernameCache.delete(id)
    }
}

/**
 * @returns {Array<{ value: String, date: Number }>}
 * @param {GuildMember} member
 */
export function fetchUsernameHistory(member: GuildMember | string): Array<{ value: string; date: number }> {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (usernameCache.has(id)) {
        return usernameCache.get(id)
    }

    const query = db.prepare("SELECT value, date FROM usernames WHERE id = ? AND type = 'username'").all(id)

    inPlaceSort(query).desc((u) => u.date)

    usernameCache.set(id, query)

    return query
}

/**
 *
 * @param {GuildMember} member
 */
export function clearUsernameHistory(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("DELETE FROM usernames WHERE id = ? AND type = 'username'").run(id)

    if (usernameCache.has(id)) {
        usernameCache.delete(id)
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {String} url
 */
export function addNewAvatar(member: GuildMember | string, url: string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("INSERT INTO usernames (id, type, value, date) VALUES (?, ?, ?, ?)").run(id, "avatar", url, Date.now())

    if (avatarCache.has(id)) {
        avatarCache.delete(id)
    }
}

/**
 * @returns {Array<{ value: String, date: Number }>}
 * @param {GuildMember} member
 */
export function fetchAvatarHistory(member: GuildMember | string): Array<{ value: string; date: number }> {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (avatarCache.has(id)) {
        return avatarCache.get(id)
    }

    const query = db.prepare("SELECT value, date FROM usernames WHERE id = ? AND type = 'avatar'").all(id)

    inPlaceSort(query).desc((u) => u.date)

    avatarCache.set(id, query)

    return query
}

/**
 *
 * @param {GuildMember} member
 */
export function clearAvatarHistory(member: GuildMember | string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    db.prepare("DELETE FROM usernames WHERE id = ? AND type = 'avatar'").run(id)

    if (avatarCache.has(id)) {
        avatarCache.delete(id)
    }
}

/**
 *
 * @param {GuildMember} member
 * @returns {({username: String}|undefined)}
 */
export function getLastfmUsername(member: GuildMember | string): { username: string } | undefined {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    if (lastfmUsernameCache.has(id)) {
        return lastfmUsernameCache.get(id)
    } else {
        const query = db.prepare("SELECT username FROM lastfm WHERE id = ?").get(id)

        if (query) {
            lastfmUsernameCache.set(id, query)
        }

        return query
    }
}

/**
 *
 * @param {GuildMember} member
 * @param {String} username
 */
export async function setLastfmUsername(member: GuildMember, username: string) {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    username = cleanString(username)

    const res = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${process.env.LASTFM_TOKEN}&format=json`
    ).then((res) => res.json())

    if (res.error && res.error == 6) return false

    if (lastfmUsernameCache.has(member.user.id)) {
        lastfmUsernameCache.delete(member.user.id)
    }

    const query = db.prepare("SELECT id FROM lastfm WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO lastfm (id, username) VALUES (?, ?)").run(id, res.user.name)
    } else {
        db.prepare("UPDATE lastfm SET username = ? WHERE id = ?").run(res.user.name, id)
    }

    return true
}

/**
 * @param {Guild} guild
 * @param {GuildMember} member
 * @param {Number} amount
 * @returns {Array<{ date: Number, user_tag: String, url: String, content: String }>}
 */
export function fetchUserMentions(
    guild: Guild,
    member: GuildMember | string,
    amount = 100
): Array<{ date: number; user_tag: string; url: string; content: string }> {
    let id: string
    if (member instanceof GuildMember) {
        id = member.user.id
    } else {
        id = member
    }

    const mentions = db
        .prepare(
            "SELECT date, user_tag, url, content FROM mentions WHERE guild_id = ? AND target_id = ? ORDER BY date DESC LIMIT ?"
        )
        .all(guild.id, id, amount)

    return mentions
}
