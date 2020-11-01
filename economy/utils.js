const fs = require("fs")
let users = JSON.parse(fs.readFileSync("./economy/users.json"))
const multiplier = JSON.parse(fs.readFileSync("./economy/slotsmulti.json"))
const { topgg } = require("../config.json")
const DBL = require("dblapi.js")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { GuildMember, Guild, Client } = require("discord.js")
const { getTimestamp } = require("../utils/utils")
const { EconProfile } = require("../utils/classes/EconStorage")
const { CustomEmbed } = require("../utils/classes/EmbedBuilders")
const dbl = new DBL(topgg, { webhookPort: 5000, webhookAuth: "123" })
const voteCache = new Map()

let timer = 0
let timerCheck = true
setInterval(() => {
    const users1 = JSON.parse(fs.readFileSync("./economy/users.json"))

    if (JSON.stringify(users) != JSON.stringify(users1)) {

        fs.writeFile("./economy/users.json", JSON.stringify(users), (err) => {
            if (err) {
                return console.log(err)
            }
            console.log("\x1b[32m[" + getTimestamp() + "] economy data saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        users = JSON.parse(fs.readFileSync("./economy/users.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] economy data refreshed\x1b[37m")
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        users = JSON.parse(fs.readFileSync("./economy/users.json"))
        console.log("\x1b[32m[" + getTimestamp() + "] economy data refreshed\x1b[37m")
        timer = 0
    }

}, 60000)

setInterval(() => {
    let date = new Date()
    date = getTimestamp().split(":").join(".") + " - " + date.getDate() + "." + date.getMonth() + "." + date.getFullYear()
    fs.writeFileSync("./economy/backup/" + date + ".json", JSON.stringify(users))
    console.log("\x1b[32m[" + getTimestamp() + "] user data backup complete\x1b[37m")
}, 43200000)

setInterval(() => {
    for (let user in users) {
        if (isNaN(users[user].money.balance) || users[user].money.balance == null || users[user].money.balance == undefined || users[user].money.balance == -NaN || users[user].money.balance < 0) {

            users[user].money.balance = 0

            console.log("[" + getTimestamp() + "] " + user + " set to 0 because NaN")
        }

        if (isNaN(users[user].money.bank) || users[user].money.bank == null || users[user].money.bank == undefined || users[user].money.bank == -NaN || users[user].money.bank < 0) {

            users[user].money.bank = 0

            console.log("[" + getTimestamp() + "] " + user + " bank set to 0 because NaN")
        }

        if (isNaN(users[user].xp) || users[user].xp == null || users[user].xp == undefined || users[user].xp == -NaN || users[user].xp < 0) {

            users[user].xp = 0

            console.log("[" + getTimestamp() + "] " + user + " xp set to 0 because NaN")
        }
    }
}, 120000)

function randomOffset() {
    return parseInt(Math.floor(Math.random() * 50000))
}

let padlockPrice = 25000 + randomOffset()

setInterval(() => {
    padlockPrice = 25000 + randomOffset()
    console.log("[" + getTimestamp() + "] padlock price updated: $" + padlockPrice)
}, 3600000)


dbl.webhook.on("ready", hook => {
    console.log(`[${getTimestamp()}] webook running on http://${hook.hostname}:${hook.port}${hook.path}`)
})

dbl.webhook.on("vote", vote => {
    const { onVote } = require("../nypsi")
    onVote(vote)
})

/**
 * 
 * @param {Client} client 
 * @param {JSON} vote 
 */
async function doVote(client, vote) {
    const { user } = vote
    const members = client.users.cache

    voteCache.set(user, true)

    setTimeout(() => {
        if (voteCache.has(member.user.id)) {
            voteCache.delete(member.user.id)
        }
    }, 21600000)

    if (!userExists(user)) return

    let member = await members.find(m => m.id == user)

    let id = false
    let memberID

    if (!member) {
        member = user
        id = true
    } else {
        memberID = member.id
    }

    const amount = 15000 * (getPrestige(memberID) + 1)
    const multi = await getMulti(memberID) * 100

    updateBalance(memberID, getBalance(memberID) + amount)

    if (!id && getDMsEnabled(memberID)) {
        const embed = new CustomEmbed().setColor("#5efb8f").setDescription("you have received the following: \n\n" +
            `+ $**${amount.toLocaleString()}**\n` +
            `+ **15**% multiplier, total: **${multi}**%`)

        await member.send("thank you for voting!", embed)
    }
}

exports.doVote = doVote

/**
 * @returns {Number}
 */
function getPadlockPrice() {
    return parseInt(padlockPrice)
}

exports.getPadlockPrice = getPadlockPrice

/**
 * @returns {Number}
 */
function getVoteCacheSize() {
    return voteCache.size
}

exports.getVoteCacheSize = getVoteCacheSize

/**
 * 
 * @param {GuildMember} member
 */
function removeFromVoteCache(member) {
    if (voteCache.has(member.user.id)) {
        voteCache.delete(member.user.id)
    }
}

exports.removeFromVoteCache = removeFromVoteCache

async function hasVoted(member) {

    let id = member

    if (member.user) id = member.user.id

    if (voteCache.has(id)) {
        return voteCache.get(id)
    } else {
        try {
            const voted = await dbl.hasVoted(id)

            if (voted) {
                voteCache.set(id, true)
                setTimeout(() => {
                    if (voteCache.has(id)) {
                        voteCache.delete(id)
                    }
                }, 900000)
                return true
            } else {
                voteCache.set(id, false)
                setTimeout(() => {
                    if (voteCache.has(id)) {
                        voteCache.delete(id)
                    }
                }, 60000)
                return false
            }
        } catch {
            voteCache.set(id, false)
            setTimeout(() => {
                voteCache.delete(id)
            }, 600000)
            console.log("[" + getTimestamp() + "] dbl server error - 10 minute cache for " + id)
            return false
        }
    } 
}

exports.hasVoted = hasVoted

/**
 * @param {GuildMember} member
 * @returns {Number}
 */
async function getMulti(member) {

    let id = member

    if (member.user) id = member.user.id

    let multi = 0

    const voted = await hasVoted(id)

    console.log(voted)

    if (voted) {
        multi += 15
    }

    const prestigeBonus = (getPrestige(member) * 2)

    multi += prestigeBonus

    multi = multi / 100

    return multi
}

exports.getMulti = getMulti

/**
 * @returns {Number}
 */
function getUserCount() {
    return Object.keys(users).length
}

exports.getUserCount = getUserCount

/**
 * @param {Guild} guild - guild object to get economy user count of
 */
function getUserCountGuild(guild) {
    let count = 0

    for (let user in users) {
        if (guild.members.cache.find(member => member.user.id == user)) {
            count++
        }
    }

    return count
}

exports.getUserCountGuild = getUserCountGuild

/**
 * 
 * @param {GuildMember} member - get balance
 */
function getBalance(member) {
    let id = member

    if (member.user) id = member.user.id

    return parseInt(users[id].money.balance)
}

exports.getBalance = getBalance

/**
 * @param {String} item - get the slots multiplier of an item
 * @returns {Number} multiplier of item
 */
function getMultiplier(item) {
    return multiplier[item]
}

exports.getMultiplier = getMultiplier

/**
 * 
 * @param {GuildManager} member 
 * @returns {Boolean}
 */
function userExists(member) {
    let id = member

    if (member.user) id = member.user.id

    if (users[id]) {
        return true
    } else {
        return false
    }
}

exports.userExists = userExists

/**
 * @param {GuildMember} member to modify balance of
 * @param {Number} amount to update balance to 
 */
function updateBalance(member, amount) {
    let id = member

    if (member.user) id = member.user.id

    const amount1 = parseInt(amount)
    users[id].money.balance = amount1
}

exports.updateBalance = updateBalance

/**
 * @returns {Number} bank balance of user
 * @param {GuildMember} member to get bank balance of
 */
function getBankBalance(member) {
    return parseInt(users[member.user.id].money.bank)
}

exports.getBankBalance = getBankBalance

/**
 * 
 * @param {GuildMember} member to modify balance of 
 * @param {Number} amount to update balance to
 */
function updateBankBalance(member, amount) {
    const amount1 = parseInt(amount)
    users[member.user.id].money.bank = amount1
}

exports.updateBankBalance = updateBankBalance

/**
 * @returns {Number} xp of user
 * @param {GuildMember} member to get xp of
 */
function getXp(member) {
    return parseInt(users[member.user.id].xp)
}

exports.getXp = getXp

/**
 * 
 * @param {GuildMember} member to modify xp of 
 * @param {Number} amount to update xp to
 */
function updateXp(member, amount) {
    const amount1 = parseInt(amount)
    users[member.user.id].xp = amount1
}

exports.updateXp = updateXp

/**
 * @returns {Number} max balance of user
 * @param {GuildMember} member to get max balance of
 */
function getMaxBankBalance(member) {
    const xp = getXp(member)
    const constant = 250
    const starting = 15000
    const bonus = xp * constant
    const max = bonus + starting

    return max
}

exports.getMaxBankBalance = getMaxBankBalance

/**
 * @returns {Array<String>} global bal top
 * @param {Number} amount of people to pull
 */
function topAmountGlobal(amount) {
    const users1 = []

    for (let user in users) {
        users1.push(user)
    }

    users1.sort(function(a, b) {
        return users[b].money.balance - users[a].money.balance
    })

    let usersFinal = []

    let count = 0

    for (let user of users1) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (!users[user].money.balance == 0) {
            usersFinal[count] = (count + 1) + " `" + user + "` $" + users[user].money.balance.toLocaleString()
            count++
        }
    }
    return usersFinal
}

exports.topAmountGlobal = topAmountGlobal

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 */
async function topAmount(guild, amount) {
    let members

    if (inCooldown(guild) || guild.memberCount == guild.members.cache.size || guild.memberCount <= 250) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()

        addCooldown(guild, 3600)
    }

    if (!members) members = guild.members.cache

    members = members.filter(m => {
        return !m.user.bot
    })
    
    const users1 = []

    for (let user in users) {
        if (members.find(member => member.user.id == user) && users[user].money.balance != 0) {
            users1.push(user)
        }
    }

    users1.sort(function(a, b) {
        return users[b].money.balance - users[a].money.balance
    })

    let usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        let target = guild.members.cache.find(member => {
            return member.user.id == id
        })
        
        return target
    }

    for (let user of users1) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (!users[user].money.balance == 0) {
            usersFinal[count] = (count + 1) + " **" + getMemberID(guild, user).user.tag + "** $" + users[user].money.balance.toLocaleString()
            count++
        }
    }
    return usersFinal
}

exports.topAmount = topAmount

/**
 * 
 * @param {GuildMember} member to create profile for
 */
function createUser(member) {

    let id = member

    if (member.user) id = member.user.id

    users[id] = new EconProfile()
}

exports.createUser = createUser

/**
 * @returns {String}
 */
function winBoard() {
    let lol = ""

    for (let item in multiplier) {
        lol = lol + item + " | " + item + " | " + item + "  **||** win: **" + multiplier[item] + "**x\n"
    }

    return lol
}

exports.winBoard = winBoard

/**
 * @returns {Number} formatted bet
 * @param {String} number to format
 */
function formatBet(number) {
    let a = number.toString().toLowerCase().replace("t", "000000000000")
    a = a.replace("b", "000000000")
    a = a.replace("m", "000000")
    a = a.replace("k", "000")

    return a
}

exports.formatBet = formatBet

/**
 * @returns {boolean}
 * @param {GuildMember} member to check
 */
function hasPadlock(member) {
    if (users[member.user.id].padlock) {
        return true
    } else {
        return false
    }
}

exports.hasPadlock = hasPadlock

/**
 * 
 * @param {GuildMember} member to update padlock setting of
 * @param {Boolean} setting padlock to true or false
 */
function setPadlock(member, setting) {
    users[member.user.id].padlock = setting
}

exports.setPadlock = setPadlock

/**
 * 
 * @param {Number} guildCount guild count
 */
async function updateStats(guildCount) {
    return await dbl.postStats(guildCount)
}

exports.updateStats = updateStats

/**
 * 
 * @param {Guildmember} member 
 */
function getPrestige(member) {
    let id = member

    if (member.user) id = member.user.id

    return users[id].prestige
}

exports.getPrestige = getPrestige

/**
 * 
 * @param {GuildMember} member 
 * @param {Number} amount 
 */
function setPrestige(member, amount) {
    users[member.user.id].prestige = amount
}

exports.setPrestige = setPrestige

/**
 * @returns {Number}
 * @param {GuildMember} member 
 */
function getPrestigeRequirement(member) {
    const constant = 250
    const extra = getPrestige(member) * constant

    return 500 + extra
}

exports.getPrestigeRequirement = getPrestigeRequirement

/**
 * @returns {Number}
 * @param {Number} xp
 */
function getPrestigeRequirementBal(xp) {
    const constant = 250
    const bonus = xp * constant

    return bonus
}

exports.getPrestigeRequirementBal = getPrestigeRequirementBal

/**
 * @returns {Boolean}
 * @param {GuildMember} member 
 */
function getDMsEnabled(member) {

    let id = member

    if (member.user) id = member.user.id

    if (!userExists(id)) createUser(id)

    if (users[id].dms == true) {
        return true
    } else {
        return false
    }
}

exports.getDMsEnabled = getDMsEnabled

/**
 * 
 * @param {GuildMember} member 
 * @param {Boolean} value 
 */
function setDMsEnabled(member, value) {
    users[member.user.id].dms = value
}

exports.setDMsEnabled = setDMsEnabled

/**
 * @returns {Number}
 * @param {Member} member 
 */
async function calcMaxBet(member) {
    const base = 100000
    const voted = await hasVoted(member)
    const bonus = 75000

    let total = base

    if (voted) {
        total += 50000
    }

    return total + (bonus * getPrestige(member))
}

exports.calcMaxBet = calcMaxBet