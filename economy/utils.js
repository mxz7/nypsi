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
    for (user in users) {
        if (users[user].balance == NaN || users[user].balance == null || users[user].balance == undefined || users[user].padlockStatus == NaN || users[user].padlockStatus == null || users[user].padlockStatus == undefined || users[user].balance == -NaN) {

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
    }
}, 15000)

module.exports = {

    getVoteCacheSize: function() {
        return voteCache.size
    },

    getVoteMulti: async function(member) {

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
        if (users[member.user.id].balance == NaN || users[member.user.id].balance == null || users[member.user.id].balance == undefined || users[member.user.id].balance == -NaN) {
            console.log(member.user.id + " set to 0 because NaN")
            users[member.user.id] = {
                balance: 0,
                padlockStatus: hasPadlocklol(member)
            }
        }
        return users[member.user.id].balance
    },

    getMultiplier: function(item) {
        return multiplier[item]
    },

    userExists: function(member) {
        if (users[member.user.id]) {
            return true
        } else {
            return false
        }
    },

    updateBalance: function(member, amount) {
        const amount1 = Math.round(amount)
        users[member.user.id] = {
            balance: amount1,
            padlockStatus: hasPadlocklol(member)
        }
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
            if (usersFinal.join().length >= 950) break

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
            if (usersFinal.join().length >= 950) break

            if (!users[user].balance == 0) {
                usersFinal[count] = (count + 1) + " **" + getMemberID(guild, user).user.tag + "** $" + users[user].balance.toLocaleString()
                count++
            }
        }
        return usersFinal
    },

    createUser: function(member) {
        users[member.user.id] = {
            balance: 100,
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