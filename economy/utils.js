const fs = require("fs");
let users = JSON.parse(fs.readFileSync("./economy/users.json"));
const multiplier = JSON.parse(fs.readFileSync("./economy/slotsmulti.json"))
const { topgg } = require("../config.json")
const DBL = require("dblapi.js");
const { inCooldown, addCooldown } = require("../guilds/utils");
const dbl = new DBL(topgg)
const voteCache = new Map()

let timer = 0
let timerCheck = true
setInterval(() => {
    const users1 = JSON.parse(fs.readFileSync("./economy/users.json"))

    if (JSON.stringify(users) != JSON.stringify(users1)) {

        fs.writeFile("./economy/users.json", JSON.stringify(users), (err) => {
            if (err) {
                return console.log(err);
            }
            console.log("\x1b[32m[" + getTimestamp() + "] economy data saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        users = JSON.parse(fs.readFileSync("./economy/users.json"));
        console.log("\x1b[32m[" + getTimestamp() + "] economy data refreshed\x1b[37m")
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        users = JSON.parse(fs.readFileSync("./economy/users.json"));
        console.log("\x1b[32m[" + getTimestamp() + "] economy data refreshed\x1b[37m")
        timer = 0
    }

}, 60000)

setInterval(() => {
    let date = new Date()
    date = getTimestamp().split(":").join(".") + " - " + date.getDate() + "." + date.getMonth() + "." + date.getFullYear()
    fs.writeFileSync('./economy/backup/' + date + '.json', JSON.stringify(users))
    console.log("\x1b[32m[" + getTimestamp() + "] user data backup complete\x1b[37m")
}, 43200000)

setInterval(() => {
    for (user in users) {
        if (users[user].balance == NaN || users[user].balance == null || users[user].padlockStatus == NaN || users[user].padlockStatus == null || users[user].padlockStatus == undefined || users[user].balance == undefined || users[user].balance == -NaN || users[user].balance < 0) {

            let padlock

            if (users[user].padlockStatus == true) {
                padlock = true
            } else {
                padlock = false 
            }

            users[user] = {
                balance: 0,
                padlockStatus: padlock
            }
            console.log("[" + getTimestamp() + "] " + user + " set to 0 because NaN")
        }

        if (users[user].bank == NaN || users[user].bank == null || users[user].bank == undefined || users[user].bank == -NaN || users[user].bank < 0) {

            users[user].bank = 0

            console.log("[" + getTimestamp() + "] " + user + " bank set to 0 because NaN")
        }

        if (users[user].xp == NaN || users[user].xp == null || users[user].xp == undefined || users[user].xp == -NaN || users[user].xp < 0) {

            users[user].xp = 0

            console.log("[" + getTimestamp() + "] " + user + " xp set to 0 because NaN")
        }
    }

    
}, 120000)

function randomOffset() {
    return parseInt(Math.floor(Math.random() * 25000))
}

let padlockPrice = 25000 + randomOffset()

setInterval(() => {
    padlockPrice = 25000 + randomOffset()
    console.log("[" + getTimestamp() + "] padlock price updated: $" + padlockPrice)
}, 3600000)

module.exports = {

    getPadlockPrice: function() {
        return parseInt(padlockPrice)
    },

    getVoteCacheSize: function() {
        return voteCache.size
    },

    /**
     * 
     * @param {*} member {Object} member - give the member object to remove from cache
     */
    removeFromVoteCache: function (member) {
        if (voteCache.has(member.user.id)) {
            voteCache.delete(member.user.id)
        }
    },

    /**
     * @param member {Object} member - give the member object to receive their vote multiplier
     */
    getVoteMulti: async function(member) {
        try {
            if (voteCache.has(member.user.id)) {
                if (!voteCache.get(member.user.id)) {
                    voteCache.delete(member.user.id)
                    return 0
                }
                return 0.2
            } 
    
            const voted = await dbl.hasVoted(member.user.id)
    
            if (voted) {
                voteCache.set(member.user.id, true)
                setTimeout(() => {
                    if (voteCache.has(member.user.id)) {
                        voteCache.delete(member.user.id)
                    }
                }, 900000)
                return 0.2
            } else {
                voteCache.set(member.user.id, false)
                setTimeout(() => {
                    if (voteCache.has(member.user.id)) {
                        voteCache.delete(member.user.id)
                    }
                }, 60000)
                return 0
            }
        } catch {
            voteCache.set(member.user.id, false)
            setTimeout(() => {
                voteCache.delete(member.user.id)
            }, 600000)
            console.log("[" + getTimestamp() + "] dbl server error - 10 minute cache for " + member.user.id)
            return 0
        }
        
    },

    getUserCount: function() {
        return Object.keys(users).length
    },

    /**
     * @param guild {Object} guild - guild object to get economy user count of
     */
    getUserCountGuild: function(guild) {
        let count = 0

        for (user in users) {
            if (guild.members.cache.find(member => member.user.id == user)) {
                count++
            }
        }

        return count
    },

    /**
     * 
     * @param member {Object} member - get balance
     */
    getBalance: function(member) {
        return parseInt(users[member.user.id].balance)
    },

    /**
     * @param item {string} item - get the slots multiplier of an item
     * @returns {number} multiplier of item
     */
    getMultiplier: function(item) {
        return multiplier[item]
    },

    /**
     * 
     * @param id {string} id of user in question
     * @returns {boolean}
     */
    userExistsID: function(id) {
        if (users[id]) {
            return true
        } else {
            return false
        }
    },

    /**
     * 
     * @param member {Object} id of user in question
     * @returns {boolean}
     */
    userExists: function(member) {
        if (users[member.user.id]) {
            return true
        } else {
            return false
        }
    },

    /**
     * @param member {Object} user to modify balance of
     * @param amount {number} amount to update balance to 
     */
    updateBalance: function(member, amount) {
        const amount1 = parseInt(amount)
        users[member.user.id].balance = amount1
    },

    /**
     * @param id {string} id of user to modify balance of
     * @param amount {number} amount to update balance to
     */
    updateBalanceID: function(id, amount) {
        const amount1 = parseInt(amount)
        users[id].balance = amount1
    },

    /**
     * @returns {number} bank balance of user
     * @param member {Object} user to get bank balance of
     */
    getBankBalance: function(member) {
        return parseInt(users[member.user.id].bank)
    },

    /**
     * 
     * @param member {Object} member to modify balance of 
     * @param amount {number} amount to update balance to
     */
    updateBankBalance: function(member, amount) {
        const amount1 = parseInt(amount)
        users[member.user.id].bank = amount1
    },

    /**
     * @returns {number} xp of user
     * @param member {Object} member to get xp of
     */
    getXp: function(member) {
        return parseInt(users[member.user.id].xp)
    },

    /**
     * 
     * @param member {Object} member to modify xp of 
     * @param amount {number} amount to update xp to
     */
    updateXp: function(member, amount) {
        if (users[member.user.id].xp >= 694200) return
        const amount1 = parseInt(amount)
        users[member.user.id].xp = amount1
    },

    /**
     * @returns {number} max balance of user
     * @param member {Object} member to get max balance of
     */
    getMaxBankBalance: function(member) {
        const xp = xpBalance(member)
        const constant = 250
        const starting = 15000
        const bonus = xp * constant
        const max = bonus + starting

        return max
    },

    /**
     * @returns {Array} global bal top
     * @param amount {number} amount of people to pull
     */
    topAmountGlobal: function(amount) {

        const users1 = []

        for (user in users) {
            users1.push(user)
        }

        users1.sort(function(a, b) {
            return users[b].balance - users[a].balance;
        })

        let usersFinal = []

        let count = 0

        for (user of users1) {
            if (count >= amount) break
            if (usersFinal.join().length >= 1500) break

            if (!users[user].balance == 0) {
                usersFinal[count] = (count + 1) + " `" + user + "` $" + users[user].balance.toLocaleString()
                count++
            }
        }
        return usersFinal

    },

    /**
     * @returns {Array}
     * @param guild {Object} guild to pull data from
     * @param amount {number} amount of users to return with
     */
    topAmount: async function(guild, amount) {

        let members

        if (inCooldown(guild) || guild.memberCount == guild.members.cache.size || guild.memberCount <= 250) {
            members = guild.members.cache
        } else {
            members = await guild.members.fetch()

            addCooldown(guild, 3600)
        }

        if (!members) members = guild.members.cache
    
        const users1 = []

        for (user in users) {
            if (members.find(member => member.user.id == user) && users[user].balance != 0) {
                users1.push(user)
            }
        }

        users1.sort(function(a, b) {
            return users[b].balance - users[a].balance;
        })

        let usersFinal = []

        let count = 0

        for (user of users1) {
            if (count >= amount) break
            if (usersFinal.join().length >= 1500) break

            if (!users[user].balance == 0) {
                usersFinal[count] = (count + 1) + " **" + getMemberID(guild, user).user.tag + "** $" + users[user].balance.toLocaleString()
                count++
            }
        }
        return usersFinal
    },

    /**
     * 
     * @param member {Object} member to create profile for
     */
    createUser: function(member) {
        users[member.user.id] = {
            balance: 500,
            bank: 4500,
            xp: 0,
            padlockStatus: false
        }
    },

    /**
     * 
     * @param member {string} user id of member to create profile for
     */
    createUserID: function(id) {
        users[id] = {
            balance: 5000,
            bank: 4500,
            xp: 0,
            padlockStatus: false
        }
    },

    /**
     * @returns {string} 
     */
    winBoard: function() {

        lol = ""

        for (item in multiplier) {
            lol = lol + item + " | " + item + " | " + item + "  **||** win: **" + multiplier[item] + "**x\n"
        }

        return lol
    },

    /**
     * @returns {number} formatted bet
     * @param number {string} bet to format
     */
    formatBet: function(number) {
        let a = number.toString().toLowerCase().replace("t", "000000000000")
        a = a.replace("b", "000000000")
        a = a.replace("m", "000000")
        a = a.replace("k", "000")

        return a
    },

    /**
     * @returns {boolean}
     * @param member {Object} member to check
     */
    hasPadlock: function(member) {
        if (users[member.user.id].padlockStatus) {
            return true
        } else {
            return false
        }
    },

    /**
     * 
     * @param member {Object} member to update padlock setting of
     * @param setting {boolean} set padlock to true or false
     */
    setPadlock: function(member, setting) {
        users[member.user.id].padlockStatus = setting
    },

    /**
     * 
     * @param {Integer} guildCount guild count
     */
    updateStats: async function(guildCount) {
        return await dbl.postStats(guildCount)
    }
}

function getTimestamp() {
    const date = new Date();
    let hours = date.getHours().toString();
    let minutes = date.getMinutes().toString();
    let seconds = date.getSeconds().toString();
    
    if (hours.length == 1) {
        hours = "0" + hours;
    } 
    
    if (minutes.length == 1) {
        minutes = "0" + minutes;
    } 
    
    if (seconds.length == 1) {
        seconds = "0" + seconds;
    }
    
    const timestamp = hours + ":" + minutes + ":" + seconds;

    return timestamp
}

function getMemberID(guild, id) {
    let target = guild.members.cache.find(member => {
        return member.user.id == id
    })

    return target
}

function xpBalance(member) {
    if (!users[member.user.id].xp) {
        return 0
    } else {
        return users[member.user.id].xp
    }
}