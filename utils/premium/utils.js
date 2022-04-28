const { GuildMember } = require("discord.js")
const fs = require("fs")
const { PremUser } = require("../classes/PremStorage")
const { getDatabase } = require("../database/database")
const { logger } = require("../logger")
const { formatDate } = require("../utils")

let commands = {}
if (!process.env.GITHUB_ACTION) commands = JSON.parse(fs.readFileSync("./utils/premium/commands.json"))

logger.info(`${Array.from(Object.keys(commands)).length.toLocaleString()} custom commands loaded`)
const db = getDatabase()

const isPremiumCache = new Map()
const tierCache = new Map()
const colorCache = new Map()

if (!process.env.GITHUB_ACTION) {
    setInterval(() => {
        const data1 = JSON.parse(fs.readFileSync("./utils/premium/commands.json"))

        if (JSON.stringify(commands) != JSON.stringify(data1)) {
            fs.writeFile("./utils/premium/commands.json", JSON.stringify(commands), (err) => {
                if (err) {
                    return logger.error(err)
                }
                logger.info("premium commands data saved")
            })
        }
    }, 120000 + Math.floor(Math.random() * 60) * 1000)
}

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
function isPremium(member) {
    let id = member
    if (member.user) {
        id = member.user.id
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

exports.isPremium = isPremium

/**
 * @returns {Number}
 * @param {GuildMember} member
 */
function getTier(member) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    if (tierCache.has(id)) {
        return tierCache.get(id)
    }

    const query = db.prepare("SELECT level FROM premium WHERE id = ?").get(id)

    tierCache.set(id, query.level)

    return query.level
}

exports.getTier = getTier

/**
 * @param {GuildMember} member
 * @param {Number} level
 */
function addMember(member, level) {
    let id = member
    if (member.user) {
        id = member.user.id
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

exports.addMember = addMember

/**
 * @returns {PremUser}
 * @param {GuildMember} member
 */
function getPremiumProfile(member) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    const query = db.prepare("SELECT * FROM premium WHERE id = ?").get(id)

    return createPremUser(query)
}

exports.getPremiumProfile = getPremiumProfile

/**
 * @param {GuildMember} member
 * @param {Number} level
 */
function setTier(member, level) {
    let id = member
    if (member.user) {
        id = member.user.id
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

exports.setTier = setTier

/**
 * @param {GuildMember} member
 * @param {String} color
 */
function setEmbedColor(member, color) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("UPDATE premium SET embed_color = ? WHERE id = ?").run(color, id)

    if (colorCache.has(id)) {
        colorCache.delete(id)
    }
}

exports.setEmbedColor = setEmbedColor

/**
 * @returns {String}
 * @param {String} member id
 */
function getEmbedColor(member) {
    if (colorCache.has(member)) {
        return colorCache.get(member)
    }

    const query = db.prepare("SELECT embed_color FROM premium WHERE id = ?").get(member)

    colorCache.set(member, query.embed_color)

    return query.embed_color
}

exports.getEmbedColor = getEmbedColor

/**
 * @param {GuildMember} member
 * @param {Date} date
 */
function setLastDaily(member, date) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("UPDATE premium SET last_daily = ? WHERE id = ?").run(date, id)
}

exports.setLastDaily = setLastDaily

/**
 * @param {GuildMember} member
 * @param {Date} date
 */
function setLastWeekly(member, date) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("UPDATE premium SET last_weekly = ? WHERE id = ?").run(date, id)
}

exports.setLastWeekly = setLastWeekly

/**
 * @param {GuildMember} member
 * @param {Number} status
 */
function setStatus(member, status) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("UPDATE premium SET status = ? WHERE id = ?").run(status, id)
}

exports.setStatus = setStatus

/**
 * @param {GuildMember} member
 * @param {String} reason
 */
function setReason(member, reason) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("UPDATE premium SET revoke_reason = ? WHERE id = ?").run(reason, id)
}

exports.setReason = setReason

/**
 * @param {GuildMember} member
 * @param {Date} date
 */
function setStartDate(member, date) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("UPDATE premium SET start_date = ? WHERE id = ?").run(date, id)
}

exports.setStartDate = setStartDate

/**
 * @param {String} member id
 */
function renewUser(member) {
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

exports.renewUser = renewUser

/**
 * @param {String} member id
 */
async function expireUser(member) {
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

exports.expireUser = expireUser

/**
 * @param {String} member id
 * @param {String} reason
 */
function revokeUser(member, reason) {
    db.prepare("UPDATE premium SET level = 0, status = 2, revoke_reason = ? WHERE id = ?").run(reason, member)

    const { requestDM } = require("../../nypsi")
    requestDM(member, "your membership has been revoked")
}

exports.revokeUser = revokeUser

/**
 * @returns {Date}
 * @param {String} member id
 */
function getLastDaily(member) {
    const query = db.prepare("SELECT last_daily FROM premium WHERE id = ?").get(member)

    return query.last_daily
}

exports.getLastDaily = getLastDaily

/**
 * @returns {Date}
 * @param {String} member id
 */
function getLastWeekly(member) {
    const query = db.prepare("SELECT last_weekly FROM premium WHERE id = ?").get(member)

    return query.last_weekly
}

exports.getLastWeekly = getLastWeekly

/**
 * @returns {{ trigger: String, content: String, owner: String, uses: Number }}
 * @param {String} name
 */
function getCommand(name) {
    for (let cmd in commands) {
        cmd = commands[cmd]

        if (cmd.trigger == name) {
            if (!isPremium(cmd.owner) || getTier(cmd.owner) < 3) {
                delete commands[cmd]
                return null
            }

            return cmd
        }
    }
    return null
}

exports.getCommand = getCommand

/**
 *
 * @param {String} id
 * @returns {{ trigger: String, content: String, owner: String, uses: Number }}
 */
function getUserCommand(id) {
    return commands[id]
}

exports.getUserCommand = getUserCommand

/**
 *
 * @param {String} id
 * @param {String} trigger
 * @param {String} content
 * @param {Number} uses
 */
function setCommand(id, trigger, content) {
    commands[id] = {
        trigger: trigger,
        content: content,
        owner: id,
        uses: 0,
    }
}

exports.setCommand = setCommand

function addUse(id) {
    if (!commands[id].uses) {
        commands[id].uses = 1
    } else {
        commands[id].uses++
    }
}

exports.addUse = addUse

/**
 * 
 * @param {GuildMember} member 
 * @param {number} date 
 */
function setExpireDate(member, date) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("UPDATE premium SET expire_date = ? WHERE id = ?").run(date, id)

    const { requestDM } = require("../../nypsi")
    requestDM(
        id,
        `your membership will now expire on **${formatDate(date)}**`
    )
}

exports.setExpireDate = setExpireDate

function createPremUser(query) {
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
