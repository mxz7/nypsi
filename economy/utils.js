const fs = require("fs");
let users = JSON.parse(fs.readFileSync("./economy/users.json"));
const multiplier = JSON.parse(fs.readFileSync("./economy/slotsmulti.json"))
const { topgg } = require("../config.json")
const DBL = require("dblapi.js")
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
            console.log("\x1b[32m[" + getTimestamp() + "] data saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 5 && !timerCheck) {
        users = JSON.parse(fs.readFileSync("./economy/users.json"));
        console.log("\x1b[32m[" + getTimestamp() + "] data refreshed\x1b[37m")
        timerCheck = true
    }

    if (timer >= 30 && timerCheck) {
        users = JSON.parse(fs.readFileSync("./economy/users.json"));
        console.log("\x1b[32m[" + getTimestamp() + "] data refreshed\x1b[37m")
        timer = 0
    }

}, 60000)

setInterval(() => {
    let date = new Date()
    date = getTimestamp().split(":").join(".") + " - " + date.getDate() + "." + date.getMonth() + "." + date.getFullYear()
    fs.writeFileSync('./economy/backup/' + date + '.json', JSON.stringify(users))
    console.log("\x1b[32m[" + getTimestamp() + "] data backup complete\x1b[37m")
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
                setTimeout(() => voteCache.delete(member.user.id), 900000)
                return 0.2
            } else {
                voteCache.set(member.user.id, false)
                setTimeout(() => voteCache.delete(member.user.id), 60000)
                return 0
            }
        } catch {
            console.log("[" + getTimestamp() + "] dbl server error")
            return 0
        }
        
    },

    getUserCount: function() {
        return Object.keys(users).length
    },

    getUserCountGuild: function(guild) {
        let count = 0

        for (user in users) {
            if (guild.members.cache.find(member => member.user.id == user)) {
                count++
            }
        }

        return count
    },

    getBalance: function(member) {
        return parseInt(users[member.user.id].balance)
    },

    getMultiplier: function(item) {
        return multiplier[item]
    },

    userExistsID: function(id) {
        if (users[id]) {
            return true
        } else {
            return false
        }
    },

    userExists: function(member) {
        if (users[member.user.id]) {
            return true
        } else {
            return false
        }
    },

    updateBalance: function(member, amount) {
        const amount1 = parseInt(amount)
        users[member.user.id].balance = amount1
    },

    updateBalanceID: function(id, amount) {
        const amount1 = parseInt(amount)
        users[id].balance = amount1
    },

    getBankBalance: function(member) {
        return parseInt(users[member.user.id].bank)
    },

    updateBankBalance: function(member, amount) {
        const amount1 = parseInt(amount)
        users[member.user.id].bank = amount1
    },

    getXp: function(member) {
        return parseInt(users[member.user.id].xp)
    },

    updateXp: function(member, amount) {
        const amount1 = parseInt(amount)
        users[member.user.id].xp = amount1
    },

    getMaxBankBalance: function(member) {
        const xp = xpBalance(member)
        const constant = 500
        const starting = 25000
        const bonus = xp * constant
        const max = bonus + starting

        return max
    },

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

    topAmount: function(guild, amount) {
    
        const users1 = []

        for (user in users) {
            if (guild.members.cache.find(member => member.user.id == user) && users[user].balance != 0) {
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

    createUser: function(member) {
        users[member.user.id] = {
            balance: 500,
            bank: 4500,
            xp: 0,
            padlockStatus: false
        }
    },

    createUserID: function(id) {
        users[id] = {
            balance: 5000,
            bank: 4500,
            xp: 0,
            padlockStatus: false
        }
    },

    winBoard: function() {

        lol = ""

        for (item in multiplier) {
            lol = lol + item + " | " + item + " | " + item + "  **||** win: **" + multiplier[item] + "**x\n"
        }

        return lol
    },

    formatBet: function(number) {
        let a = number.toString().toLowerCase().replace("t", "000000000000")
        a = a.replace("b", "000000000")
        a = a.replace("m", "000000")
        a = a.replace("k", "000")

        return a
    },

    hasPadlock: function(member) {
        if (users[member.user.id].padlockStatus) {
            return true
        } else {
            return false
        }
    },

    setPadlock: function(member, setting) {
        users[member.user.id].padlockStatus = setting
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

function hasPadlocklol(member) {
    if (users[member.user.id].padlockStatus) {
        return true
    } else {
        return false
    }
}

function bankBalance(member) {
    if (!users[member.user.id].bank) {
        return 0
    } else {
        return users[member.user.id].bank
    }
}

function xpBalance(member) {
    if (!users[member.user.id].xp) {
        return 0
    } else {
        return users[member.user.id].xp
    }
}