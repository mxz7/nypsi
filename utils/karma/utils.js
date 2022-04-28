const { GuildMember } = require("discord.js")
const { getDatabase } = require("../database/database")
const { logger } = require("../logger")
const { MStoTime } = require("../utils")

const db = getDatabase()

let karmaShop = false

/**
 *
 * @param {GuildMember} member
 * @returns {Number}
 */
function getKarma(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, karma, last_command) VALUES (?, ?, ?)").run(id, 1, Date.now())
        return 1
    } else {
        return query.karma
    }
}

exports.getKarma = getKarma

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
function addKarma(member, amount) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, karma, last_command) VALUES (?, ?, ?)").run(id, amount + 1, Date.now())
    } else {
        db.prepare("UPDATE karma SET karma = karma + ? WHERE id = ?").run(amount, id)
    }
}

exports.addKarma = addKarma

/**
 *
 * @param {GuildMember} member
 * @param {Number} amount
 */
function removeKarma(member, amount) {
    let id = member

    if (member.user) id = member.user.id

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

exports.removeKarma = removeKarma

/**
 *
 * @param {GuildMember} member
 */
function updateLastCommand(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT karma FROM karma WHERE id = ?").get(id)

    if (!query) {
        db.prepare("INSERT INTO karma (id, last_command) VALUES (?, ?)").run(id, Date.now())
    } else {
        db.prepare("UPDATE karma SET last_command = ? WHERE id = ?").run(Date.now(), id)
    }
}

exports.updateLastCommand = updateLastCommand

/**
 *
 * @returns {Boolean}
 */
function isKarmaShopOpen() {
    return karmaShop
}

exports.isKarmaShopOpen = isKarmaShopOpen

function openKarmaShop() {
    karmaShop = true
}

exports.openKarmaShop = openKarmaShop

function closeKarmaShop() {
    karmaShop = false
}

exports.closeKarmaShop = closeKarmaShop

/**
 *
 * @param {GuildMember} member
 * @returns {number}
 */
function getLastCommand(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT last_command FROM karma WHERE id = ?").get(id)

    return query.last_command
}

exports.getLastCommand = getLastCommand

function deteriorateKarma() {
    const now = Date.now()

    const threshold = now - 43200000

    /**
     * @type {Array<{id: String, karma: Number, last_command: Number}>}
     */
    const users = db.prepare("SELECT * FROM karma WHERE last_command < ?").all(threshold)

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

    logger.auto(`${total} total karma deteriorated`)
}

// prettier-ignore
(() => {
    const now = new Date()

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`
    }

    const needed = new Date(Date.parse(d) + 10800000)

    setTimeout(async () => {
        setInterval(() => {
            deteriorateKarma()
        }, 86400000)
        deteriorateKarma()
    }, needed - now)

    logger.auto(`karma deterioration will run in ${MStoTime(needed - now)}`)
})()
