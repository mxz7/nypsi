const { GuildMember, Collection, Message, Guild } = require("discord.js")
const { inPlaceSort } = require("fast-sort")
const { getDatabase } = require("../database/database")
const { default: fetch } = require("node-fetch")
const { cleanString } = require("../utils")

const db = getDatabase()
const existsCache = new Set()
const optCache = new Map()
const usernameCache = new Map()
const avatarCache = new Map()
const lastfmUsernameCache = new Map()

/**
 * @type {Array<{ type: String, members: Collection, message: Message, guild: String }>}
 */
const mentionQueue = []
/**
 * @type {Array<{ type: String, members: Collection, message: Message, guild: String }>}
 */
exports.mentionQueue = mentionQueue
/**
 * @type {Array<String>}
 */
const deleteQueue = []
/**
 * @type {Array<String>}
 */
exports.deleteQueue = deleteQueue

/**
 *
 * @param {GuildMember} member
 */
function createUsernameProfile(member, tag, url) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("INSERT INTO usernames_optout (id) VALUES (?)").run(id)
    db.prepare("INSERT INTO usernames (id, value, date) VALUES (?, ?, ?)").run(
        id,
        member.user ? member.user.tag : tag,
        Date.now()
    )
    if (url)
        db.prepare("INSERT INTO usernames (id, value, type, date) VALUES (?, ?, ?, ?)").run(id, url, "avatar", Date.now())
}

exports.createUsernameProfile = createUsernameProfile

/**
 * @returns {Boolean}
 * @param {GuildMember} member
 */
function usernameProfileExists(member) {
    let id = member

    if (member.user) id = member.user.id

    if (existsCache.has(id)) return true

    const query = db.prepare("SELECT id FROM usernames_optout WHERE id = ?").get(id)

    if (query) {
        existsCache.add(id)
        return true
    } else {
        return false
    }
}

exports.usernameProfileExists = usernameProfileExists

function isTracking(member) {
    let id = member

    if (member.user) id = member.user.id

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

exports.isTracking = isTracking

function disableTracking(member) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("UPDATE usernames_optout SET tracking = 0 WHERE id = ?").run(id)

    if (optCache.has(id)) {
        optCache.delete(id)
    }
}

exports.disableTracking = disableTracking

function enableTracking(member) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("UPDATE usernames_optout SET tracking = 1 WHERE id = ?").run(id)

    if (optCache.has(id)) {
        optCache.delete(id)
    }
}

exports.enableTracking = enableTracking

/**
 *
 * @param {GuildMember} member
 * @param {String} username
 */
function addNewUsername(member, username) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("INSERT INTO usernames (id, type, value, date) VALUES (?, ?, ?, ?)").run(id, "username", username, Date.now())

    if (usernameCache.has(id)) {
        usernameCache.delete(id)
    }
}

exports.addNewUsername = addNewUsername

/**
 * @returns {Array<{ value: String, date: Number }>}
 * @param {GuildMember} member
 */
function fetchUsernameHistory(member) {
    let id = member

    if (member.user) id = member.user.id

    if (usernameCache.has(id)) {
        return usernameCache.get(id)
    }

    const query = db.prepare("SELECT value, date FROM usernames WHERE id = ? AND type = 'username'").all(id)

    inPlaceSort(query).desc((u) => u.date)

    usernameCache.set(id, query)

    return query
}

exports.fetchUsernameHistory = fetchUsernameHistory

/**
 *
 * @param {GuildMember} member
 */
function clearUsernameHistory(member) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("DELETE FROM usernames WHERE id = ? AND type = 'username'").run(id)

    if (usernameCache.has(id)) {
        usernameCache.delete(id)
    }
}

exports.clearUsernameHistory = clearUsernameHistory

/**
 *
 * @param {GuildMember} member
 * @param {String} url
 */
function addNewAvatar(member, url) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("INSERT INTO usernames (id, type, value, date) VALUES (?, ?, ?, ?)").run(id, "avatar", url, Date.now())

    if (avatarCache.has(id)) {
        avatarCache.delete(id)
    }
}

exports.addNewAvatar = addNewAvatar

/**
 * @returns {Array<{ value: String, date: Number }>}
 * @param {GuildMember} member
 */
function fetchAvatarHistory(member) {
    let id = member

    if (member.user) id = member.user.id

    if (avatarCache.has(id)) {
        return avatarCache.get(id)
    }

    const query = db.prepare("SELECT value, date FROM usernames WHERE id = ? AND type = 'avatar'").all(id)

    inPlaceSort(query).desc((u) => u.date)

    avatarCache.set(id, query)

    return query
}

exports.fetchAvatarHistory = fetchAvatarHistory

/**
 *
 * @param {GuildMember} member
 */
function clearAvatarHistory(member) {
    let id = member

    if (member.user) id = member.user.id

    db.prepare("DELETE FROM usernames WHERE id = ? AND type = 'avatar'").run(id)

    if (avatarCache.has(id)) {
        avatarCache.delete(id)
    }
}

exports.clearAvatarHistory = clearAvatarHistory

/**
 *
 * @param {GuildMember} member
 * @returns {({username: String}|undefined)}
 */
function getLastfmUsername(member) {
    let id = member

    if (member.user) id = member.user.id

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

exports.getLastfmUsername = getLastfmUsername

/**
 *
 * @param {GuildMember} member
 * @param {String} username
 */
async function setLastfmUsername(member, username) {
    let id = member

    if (member.user) id = member.user.id

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

exports.setLastfmUsername = setLastfmUsername

/**
 * @param {Guild} guild
 * @param {GuildMember} member
 * @param {Number} amount
 * @returns {Array<{ date: Number, user_tag: String, url: String, content: String }>}
 */
function fetchUserMentions(guild, member, amount = 100) {
    let id = member

    if (member.user) id = member.user.id

    const mentions = db
        .prepare(
            "SELECT date, user_tag, url, content FROM mentions WHERE guild_id = ? AND target_id = ? ORDER BY date DESC LIMIT ?"
        )
        .all(guild.id, id, amount)

    return mentions
}

exports.fetchUserMentions = fetchUserMentions
