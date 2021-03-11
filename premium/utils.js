const { GuildMember } = require("discord.js")
const fs = require("fs")
const { PremUser } = require("../utils/classes/PremStorage")
const { getTimestamp } = require("../utils/utils")
let data = JSON.parse(fs.readFileSync("./premium/data.json"))

let timer = 0
let timerCheck = true
setInterval(() => {
    const data1 = JSON.parse(fs.readFileSync("./premium/data.json"))

    if (JSON.stringify(data) != JSON.stringify(data1)) {

        fs.writeFile("./premium/data.json", JSON.stringify(data), (err) => {
            if (err) {
                return console.log(err)
            }
            console.log("\x1b[32m[" + getTimestamp() + "] premium data saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        data = JSON.parse(fs.readFileSync("./premium/data.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] premium data refreshed\x1b[37m")
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        data = JSON.parse(fs.readFileSync("./premium/data.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] premium data refreshed\x1b[37m")
        timer = 0
    }
}, 60000)

setInterval(() => {
    let date = new Date()
    date = getTimestamp().split(":").join(".") + " - " + date.getDate() + "." + date.getMonth() + "." + date.getFullYear()
    fs.writeFileSync("./premium/backup/" + date + ".json", JSON.stringify(data))
    console.log("\x1b[32m[" + getTimestamp() + "] premium data backup complete\x1b[37m")
}, 43200000)

/**
 * @returns {Boolean}
 * @param {GuildMember} member
 */
function isPremium(member) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    if (data[id]) {

        if (data[id].level == 0) {
            return false
        }

        return true
    } else {
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

    return data[member].level
}

exports.getTier = getTier

function getTierString(member) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    const a = PremUser.fromData(data[id])

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

    data[id] = new PremUser(id, level)

    console.log(data)
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

    return data[id]
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

    data[id].level = level
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

    data[id].embedColor = color
}

exports.setEmbedColor = setEmbedColor

/**
 * @param {GuildMember} member
 * @param {Date} date
 */
function setLastDaily(member, date) {
    let id = member
    if (member.user) {
        id = member.user.id
    }

    data[id].lastDaily = date
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

    data[id].lastWeekly = date
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

    data[id].status = status
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

    data[id].revokeReason = reason
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

    data[id].startDate = date
}

exports.setStartDate = setStartDate