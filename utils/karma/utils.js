const { getDatabase } = require("../database/database")
const { info, types } = require("../logger")
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
        db.prepare("INSERT INTO karma (id, karma) VALUES (?, ?)").run(id, 1)
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
        db.prepare("INSERT INTO karma (id, karma) VALUES (?, ?)").run(id, amount + 1)
    } else {
        db.prepare("UPDATE karma SET karma = karma + ? WHERE id = ?").run(id, amount)
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
        db.prepare("INSERT INTO karma (id, karma) VALUES (?, ?)").run(id, 1)
    } else {
        if (amount > query.karma) {
            amount = query.karma - 1
        }
        db.prepare("UPDATE karma SET karma = karma - ? WHERE id = ?").run(id, amount)
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
        db.prepare("UPDATE karma SET karma =  ? WHERE id = ?").run(id, Date.now())
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

function deteriorateKarma() {
    const now = Date.now()

    const threshold = now - 86400000

    /**
     * @type {Array<{id: String, karma: Number, last_command: Number}>}
     */
    const users = db.prepare("SELECT * FROM karma WHERE karma > 10 AND last_command < ?").all(threshold)

    let total = 0

    for (const user of users) {
        let karmaToRemove = 10

        if (now - 604800000 > user.last_command) {
            karmaToRemove = 50
        }

        if (karmaToRemove > user.karma) {
            karmaToRemove = user.karma - 1
        }

        total += karmaToRemove

        db.prepare("UPDATE karma SET karma = karma - ? WHERE id = ?").run(karmaToRemove, user.id)
    }

    info(`${total} total karma deteriorated`, types.AUTOMATION)
}

;(() => {
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

    info(`karma deterioration will run in ${MStoTime(needed - now)}`, types.AUTOMATION)
})()
