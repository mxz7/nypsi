const fs = require("fs")
let users = JSON.parse(fs.readFileSync("./utils/economy/users.json"))
const banned = JSON.parse(fs.readFileSync("./utils/economy/ban.json"))
const multiplier = JSON.parse(fs.readFileSync("./utils/economy/slotsmulti.json"))
const { topgg } = require("../../config.json")
const DBL = require("dblapi.js")
const { inCooldown, addCooldown } = require("../guilds/utils")
const { GuildMember, Guild, Client } = require("discord.js")
const { EconProfile } = require("../classes/EconStorage")
const { CustomEmbed } = require("../classes/EmbedBuilders")
const { isPremium, getTier } = require("../premium/utils")
const { info, types, error, getTimestamp } = require("../logger")
const { Worker, getAllWorkers } = require("./workers")
const { inPlaceSort } = require("fast-sort")
const dbl = new DBL(topgg, { webhookPort: 5000, webhookAuth: "123" })
const voteCache = new Map()

let timer = 0
let timerCheck = true
setInterval(() => {
    const users1 = JSON.parse(fs.readFileSync("./utils/economy/users.json"))

    if (JSON.stringify(users) != JSON.stringify(users1)) {
        fs.writeFile("./utils/economy/users.json", JSON.stringify(users), (err) => {
            if (err) {
                return console.log(err)
            }
            info("economy data saved", types.DATA)
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        users = JSON.parse(fs.readFileSync("./utils/economy/users.json"))
        info("economy data refreshed", types.DATA)
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        users = JSON.parse(fs.readFileSync("./utils/economy/users.json"))
        info("economy data refreshed")
        timer = 0
    }
}, 60000)

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
    fs.writeFileSync("./utils/economy/backup/" + date + ".json", JSON.stringify(users))
    info("user data backup complete", types.DATA)
}, 43200000)

setInterval(() => {
    for (let user in users) {
        if (
            isNaN(users[user].money.balance) ||
            users[user].money.balance == null ||
            users[user].money.balance == undefined ||
            users[user].money.balance == -NaN ||
            users[user].money.balance < 0
        ) {
            users[user].money.balance = 0

            info(user + " set to 0 because NaN", types.ECONOMY)
        }

        if (
            isNaN(users[user].money.bank) ||
            users[user].money.bank == null ||
            users[user].money.bank == undefined ||
            users[user].money.bank == -NaN ||
            users[user].money.bank < 0
        ) {
            users[user].money.bank = 0

            info(user + " bank set to 0 because NaN", types.ECONOMY)
        }

        if (
            isNaN(users[user].xp) ||
            users[user].xp == null ||
            users[user].xp == undefined ||
            users[user].xp == -NaN ||
            users[user].xp < 0
        ) {
            users[user].xp = 0

            info(user + " xp set to 0 because NaN", types.ECONOMY)
        }
    }
}, 120000)

setInterval(() => {
    for (const user in users) {
        for (let worker in users[user].workers) {
            worker = users[user].workers[worker]

            if (worker.stored < worker.maxStorage) {
                if (worker.stored + worker.perInterval > worker.maxStorage) {
                    worker.stored = worker.maxStorage
                } else {
                    worker.stored += worker.perInterval
                }
            }

            users[user].workers[worker.id] = worker
        }
    }
}, 5 * 60 * 1000)

function randomOffset() {
    return parseInt(Math.floor(Math.random() * 50000))
}

let padlockPrice = 25000 + randomOffset()

setInterval(() => {
    padlockPrice = 25000 + randomOffset()
    info("padlock price updated: $" + padlockPrice, types.ECONOMY)
}, 3600000)

dbl.webhook.on("ready", (hook) => {
    info(`webook running on http://${hook.hostname}:${hook.port}${hook.path}`)
})

dbl.webhook.on("vote", (vote) => {
    const { onVote } = require("../../nypsi")
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
        if (voteCache.has(user)) {
            voteCache.delete(user)
        }
    }, 21600000)

    if (!userExists(user)) return

    let member = await members.find((m) => m.id == user)

    let id = false
    let memberID

    if (!member) {
        member = user
        id = true
    } else {
        memberID = member.id
    }

    const amount = 15000 * (getPrestige(memberID) + 1)
    const multi = Math.floor((await getMulti(memberID)) * 100)

    updateBalance(memberID, getBalance(memberID) + amount)

    if (!id && getDMsEnabled(memberID)) {
        const embed = new CustomEmbed()
            .setColor("#5efb8f")
            .setDescription(
                "you have received the following: \n\n" +
                    `+ $**${amount.toLocaleString()}**\n` +
                    `+ **10**% multiplier, total: **${multi}**%`
            )

        await member.send("thank you for voting!", embed)
        info(`sent vote confirmation to ${member.tag}`, types.ECONOMY)
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
            error("dbl server error - 10 minute cache for " + id)
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

    if (voted) {
        multi += 10
    }

    const prestigeBonus = getPrestige(member) * 2

    multi += prestigeBonus

    if (isPremium(id)) {
        switch (getTier(id)) {
            case 2:
                multi += 5
                break
            case 3:
                multi += 10
                break
            case 4:
                multi += 15
        }
    }

    multi = Math.floor(multi)

    multi = multi / 100

    return parseFloat(multi.toFixed(2))
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
        if (guild.members.cache.find((member) => member.user.id == user)) {
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
    let id = member

    if (member.user) id = member.user.id

    return parseInt(users[id].money.bank)
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
    let id = member

    if (member.user) id = member.user.id

    return parseInt(users[id].xp)
}

exports.getXp = getXp

/**
 *
 * @param {GuildMember} member to modify xp of
 * @param {Number} amount to update xp to
 */
function updateXp(member, amount) {
    if (users[member.user.id].xp >= 1000000) return

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
    const constant = 500
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

    // users1.sort(function (a, b) {
    //     return users[b].money.balance - users[a].money.balance
    // })

    inPlaceSort(users1).desc((i) => users[i].money.balance)

    let usersFinal = []

    let count = 0

    for (let user of users1) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (!users[user].money.balance == 0) {
            usersFinal[count] =
                count + 1 + " `" + user + "` $" + users[user].money.balance.toLocaleString()
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

    if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()

        addCooldown(guild, 3600)
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const users1 = []

    for (let user in users) {
        if (members.find((member) => member.user.id == user) && users[user].money.balance != 0) {
            users1.push(user)
        }
    }

    inPlaceSort(users1).desc((i) => users[i].money.balance)

    // users1.sort(function (a, b) {
    //     return users[b].money.balance - users[a].money.balance
    // })

    let usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        let target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (let user of users1) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (!users[user].money.balance == 0) {
            let pos = count + 1

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            usersFinal[count] =
                pos +
                " **" +
                getMemberID(guild, user).user.tag +
                "** $" +
                users[user].money.balance.toLocaleString()
            count++
        }
    }
    return usersFinal
}

exports.topAmount = topAmount

/**
 * @returns {Array<String>}
 * @param {Guild} guild to pull data from
 * @param {Number} amount of users to return with
 */
async function topAmountPrestige(guild, amount) {
    let members

    if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
        members = guild.members.cache
    } else {
        members = await guild.members.fetch()

        addCooldown(guild, 3600)
    }

    if (!members) members = guild.members.cache

    members = members.filter((m) => {
        return !m.user.bot
    })

    const users1 = []

    for (let user in users) {
        if (members.find((member) => member.user.id == user) && users[user].prestige != 0) {
            users1.push(user)
        }
    }

    // users1.sort(function (a, b) {
    //     return users[b].prestige - users[a].prestige
    // })

    inPlaceSort(users1).desc((i) => users[i].prestige)

    let usersFinal = []

    let count = 0

    const getMemberID = (guild, id) => {
        let target = guild.members.cache.find((member) => {
            return member.user.id == id
        })

        return target
    }

    for (let user of users1) {
        if (count >= amount) break
        if (usersFinal.join().length >= 1500) break

        if (!users[user].prestige == 0) {
            let pos = count + 1

            if (pos == 1) {
                pos = "🥇"
            } else if (pos == 2) {
                pos = "🥈"
            } else if (pos == 3) {
                pos = "🥉"
            }

            let thing = "th"

            if (users[user].prestige == 1) {
                thing = "st"
            } else if (users[user].prestige == 2) {
                thing = "nd"
            } else if (users[user].prestige == 3) {
                thing = "rd"
            }

            usersFinal[count] =
                pos +
                " **" +
                getMemberID(guild, user).user.tag +
                "** " +
                users[user].prestige +
                thing +
                " prestige"
            count++
        }
    }
    return usersFinal
}

exports.topAmountPrestige = topAmountPrestige

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
        lol =
            lol +
            item +
            " | " +
            item +
            " | " +
            item +
            " **||** win: **" +
            multiplier[item] +
            "**x\n"
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
 * @returns {Number}
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
    const bonus = 50000

    let total = base

    if (voted) {
        total += 50000
    }

    return total + bonus * getPrestige(member)
}

exports.calcMaxBet = calcMaxBet

/**
 * @returns {JSON}
 * @param {GuildMember} member
 * @param {String} member
 */
function getWorkers(member) {
    let id = member

    if (member.user) id = member.user.id

    return users[id].workers
}

exports.getWorkers = getWorkers

/**
 *
 * @param {GuildMember} member
 * @param {String} id
 * @returns {Worker}
 */
function getWorker(member, id) {
    let memberID = member
    if (member.user) memberID = member.user.id

    return users[memberID].workers[id]
}

exports.getWorker = getWorker

/**
 *
 * @param {GuildMember} member
 * @param {Number} id
 * @returns
 */
function addWorker(member, id) {
    let memberID = member
    if (member.user) memberID = member.user.id

    const workers = getAllWorkers()

    let worker = workers.get(id)

    if (!worker) return

    worker = new worker()

    return (users[memberID].workers[id] = worker)
}

exports.addWorker = addWorker

function emptyWorkersStored(member) {
    let memberID = member
    if (member.user) memberID = member.user.id

    const workers = getWorkers(memberID)

    for (let worker of Object.keys(getWorkers(member))) {
        worker = users[memberID].workers[worker]

        worker.stored = 0

        users[memberID].workers[worker.id] = worker
    }
}

exports.emptyWorkersStored = emptyWorkersStored

/**
 *
 * @param {GuildMember} member
 * @param {String} id
 */
function upgradeWorker(member, id) {
    let memberID = member
    if (member.user) memberID = member.user.id

    let worker = getWorkers(memberID)[id]

    worker = Worker.fromJSON(worker)

    worker.upgrade()

    users[memberID].workers[worker.id] = worker
}

exports.upgradeWorker = upgradeWorker

function isEcoBanned(id) {
    if (banned.banned.indexOf(id) != -1) {
        return true
    } else {
        return false
    }
}

exports.isEcoBanned = isEcoBanned

function toggleBan(id) {
    if (banned.banned.indexOf(id) != -1) {
        banned.banned.splice(banned.banned.indexOf(id), 1)
    } else {
        banned.banned.push(id)
    }

    const banned1 = JSON.parse(fs.readFileSync("./utils/economy/ban.json"))

    if (JSON.stringify(banned) != JSON.stringify(banned1)) {
        fs.writeFile("./utils/economy/ban.json", JSON.stringify(banned), (err) => {
            if (err) {
                return console.log(err)
            }
            info("banned data saved", types.DATA)
        })
    }
}

exports.toggleBan = toggleBan

/**
 * 
 * @returns {{ deleted: Number, updated: Number }}
 */
function reset() {
    let deleted = 0
    let updated = 0
    for (const id in users) {
        const user = users[id]
        if (user.xp < 10 && user.money.balance <= 500 && user.prestige == 0) {
            delete users[id]
            info("deleted " + id)
            deleted++
        } else {
            user.xp = 0
            user.money.balance = 500
            user.money.bank = 4500
            user.padlock = false
            user.workers = {}

            users[id] = user
            info("updated " + id)
            updated++
        }
    }
    return { deleted: deleted, updated: updated }
}

exports.reset = reset

// for (const user in users) {
//     for (let worker in getWorkers(user)) {
//         worker = parseInt(worker)
//         const level = users[user].workers[worker].level
//         const stored = users[user].workers[worker].stored

//         const allWorkers = getAllWorkers()

//         let newWorker = allWorkers.get(parseInt(worker))

//         newWorker = new newWorker()

//         newWorker.stored = stored

//         for (let i = 1; i < level; i++) {
//             newWorker.upgrade()
//         }

//         users[user].workers[worker] = newWorker
//         info(`${user} ${worker} ${level}`)
//     }
// }