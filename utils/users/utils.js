const { GuildMember } = require("discord.js")
const { inPlaceSort } = require("fast-sort")
const { getDatabase } = require("../database/database")

const db = getDatabase()
const optCache = new Map()
const usernameCache = new Map()

/**
 * 
 * @param {GuildMember} member 
 */
function createUsernameProfile(member) {
    db.prepare("INSERT INTO usernames_optout (id) VALUES (?)").run(member.user.id)
    db.prepare("INSERT INTO usernames (id, username, date) VALUES (?, ?, ?)").run(member.user.id, member.user.tag, Date.now())
}

exports.createUsernameProfile = createUsernameProfile

/**
 * @returns {Boolean}
 * @param {GuildMember} member
 */
function usernameProfileExists(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT id FROM usernames_optout WHERE id = ?").get(id)

    if (query) {
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

    db.prepare("UPDATE username_optout SET tracking = 1 WHERE id = ?").run(id)

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

    if (!usernameCache.has(id)) {
        return usernameCache.get(id)
    }

    const query = db.prepare("SELECT value, date FROM usernames WHERE id = ? AND type = 'username'").all(id)

    inPlaceSort(query).asc(u => u.date)

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

    db.prepare("DELETE FROM usernames WHERE id = ? AND type = 'username' AND value != ?").run(id, member.user.tag)

    if (usernameCache.has(id)) {
        usernameCache.delete(id)
    }
}

exports.clearUsernameHistory = clearUsernameHistory