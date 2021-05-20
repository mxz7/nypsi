const { GuildMember } = require("discord.js")
const fs = require("fs")
const { PremUser, status } = require("../classes/PremStorage")
const { getDatabase } = require("../database/database")
const { info, types, getTimestamp } = require("../logger")
const { formatDate } = require("../utils")
let data = JSON.parse(fs.readFileSync("./utils/premium/data.json"))
info(`${Array.from(Object.keys(data)).length.toLocaleString()} premium users loaded`, types.DATA)
let commands = JSON.parse(fs.readFileSync("./utils/premium/commands.json"))
info(
    `${Array.from(Object.keys(commands)).length.toLocaleString()} custom commands loaded`,
    types.DATA
)
const db = getDatabase()

const isPremiumCache = new Map()
const tierCache = new Map()
const colorCache = new Map()

let timer = 0
let timerCheck = true
setInterval(() => {
    const data1 = JSON.parse(fs.readFileSync("./utils/premium/data.json"))

    if (JSON.stringify(data) != JSON.stringify(data1)) {
        fs.writeFile("./utils/premium/data.json", JSON.stringify(data), (err) => {
            if (err) {
                return console.log(err)
            }
            info("premium data saved", types.DATA)
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        data = JSON.parse(fs.readFileSync("./utils/premium/data.json"))
        info("premium data refreshed", types.DATA)
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        data = JSON.parse(fs.readFileSync("./utils/premium/data.json"))
        info("premium data refreshed", types.DATA)
        timer = 0
    }
}, 60000 + Math.floor(Math.random() * 60) * 1000)

setInterval(() => {
    const data1 = JSON.parse(fs.readFileSync("./utils/premium/commands.json"))

    if (JSON.stringify(commands) != JSON.stringify(data1)) {
        fs.writeFile("./utils/premium/commands.json", JSON.stringify(commands), (err) => {
            if (err) {
                return console.log(err)
            }
            info("premium commands data saved", types.DATA)
        })
    }
}, 120000 + Math.floor(Math.random() * 60) * 1000)

setInterval(() => {
    let date = new Date()
    date =
        getTimestamp().split(":").join(".") +
        " - " +
        date.getDate() +
        "." +
        date.getMonth() +
        "." +
        date.getFullYear()
    fs.writeFileSync("./utils/premium/backup/" + date + ".json", JSON.stringify(data))
    info("premium data backup complete", types.DATA)
}, 43200000)

setInterval(async () => {
    const now = new Date().getTime()

    for (let user in data) {
        user = data[user]

        if (user.level == 0) continue

        const expiry = user.expireDate

        if (expiry <= now) {
            user = PremUser.fromData(user)

            await user.expire()
            data[user.id] = user
        }
    }
}, 300000)

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

function getTierString(member) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    const query = db.prepare("SELECT * FROM premium WHERE id = ?").get(id)

    const a = createPremUser(query)

    return a.getLevelString()
}

/**
 * @param {GuildMember} member
 * @param {Number} level
 */
function addMember(member, level) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    db.prepare("INSERT INTO premium (id, level) VALUES (?, ?)").run(id, level)

    const profile = getPremiumProfile(id)

    info(`premium level ${level} given to ${id}`)

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

    info(`premium level updated to ${level} for ${id}`)

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
    requestDM(
        member,
        `your membership has been renewed until **${formatDate(profile.expireDate)}**`
    )
}

exports.renewUser = renewUser

/**
 * @param {String} member id
 */
function expireUser(member) {
    const profile = PremUser.fromData(data[member])

    profile.expire()

    data[member] = profile
}

exports.expireUser = expireUser

/**
 * @param {String} member id
 * @param {String} reason
 */
function revokeUser(member, reason) {
    const profile = PremUser.fromData(data[member])

    profile.status = status.REVOKED
    profile.revokeReason = reason
    profile.level = 0

    data[member] = profile

    const { requestDM } = require("../../nypsi")
    requestDM(member, "your membership has been revoked")
}

exports.revokeUser = revokeUser

/**
 * @returns {Date}
 * @param {String} member id
 */
function getLastDaily(member) {
    return data[member].lastDaily
}

exports.getLastDaily = getLastDaily

/**
 * @returns {Date}
 * @param {String} member id
 */
function getLastWeekly(member) {
    return data[member].lastWeekly
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
        expireDate: query.expire_date
    })
}