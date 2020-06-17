const fs = require("fs");
let guilds = JSON.parse(fs.readFileSync("./guilds/data.json"));

let timer = 0
let timerCheck = true
setInterval(() => {
    const guilds1 = JSON.parse(fs.readFileSync("./guilds/data.json"))

    if (JSON.stringify(guilds) != JSON.stringify(guilds1)) {

        fs.writeFile("./guilds/data.json", JSON.stringify(guilds), (err) => {
            if (err) {
                return console.log(err);
            }
            console.log("\x1b[32m[" + getTimestamp() + "] guilds saved\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 10 && !timerCheck) {
        guilds = JSON.parse(fs.readFileSync("./guilds/data.json"));
        console.log("\x1b[32m[" + getTimestamp() + "] guild data refreshed\x1b[37m")
        timerCheck = true
        timer = 0
    }

}, 120000)

module.exports = {
    /**
     * 
     * @param {*} guild run check for guild
     */
    runCheck: function(guild) {

        if (!hasGuild1(guild)) createGuild1(guild)

        const currentMembersPeak = guilds[guild.id].members
        const currentOnlinesPeak = guilds[guild.id].onlines

        const currentMembers = guild.members.cache.filter(member => !member.user.bot)
        const currentOnlines = currentMembers.filter(member => member.presence.status != "offline")

        if (currentMembers.size > currentMembersPeak) {
            guilds[guild.id].members = currentMembers.size
            console.log("[" + getTimestamp() + "] members peak updated for '" + guild.name + "' " + currentMembersPeak+ " -> " + currentMembers.size)
        }

        if (currentOnlines.size > currentOnlinesPeak) {
            guilds[guild.id].onlines = currentOnlines.size
            console.log("[" + getTimestamp() + "] online peak updated for '" + guild.name + "' " + currentOnlinesPeak + " -> " + currentOnlines.size)
        }
    },

    /**
     * @returns {boolean}
     * @param {*} guild check if guild is stored
     */
    hasGuild: function(guild) {
        if (guilds[guild.id]) {
            return true
        } else {
            return false
        }
    },

    /**
     * @returns {JSON} members / onlines
     * @param {*} guild guild to get peaks of
     */
    getPeaks: function(guild) {
        return guilds[guild.id]
    },

    /**
     * 
     * @param {*} guild create guild profile
     */
    createGuild: function(guild) {
        const members = guild.members.cache.filter(member => !member.user.bot)
        const onlines = members.filter(member => member.presence.status != "offline")

        guilds[guild.id] = {
            members: members.size,
            onlines: onlines.size,
            snipeFilter: ["discord.gg", "/invite/"]
        }
    },

    /**
     * 
     * @param {*} guild get snipe filter
     * @returns {Array}
     */
    getSnipeFilter: function(guild) {
        return guilds[guild.id].snipeFilter
    },

    /**
     * 
     * @param {*} guild guild to change filter of
     * @param {*} array array to change filter to
     */
    updateFilter: function(guild, array) {
        guilds[guild.id].snipeFilter = array
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

function hasGuild1(guild) {
    if (guilds[guild.id]) {
        return true
    } else {
        return false
    }
}

function createGuild1(guild) {
    const members = guild.members.cache.filter(member => !member.user.bot)
    const onlines = members.filter(member => member.presence.status != "offline")

    guilds[guild.id] = {
        members: members.size,
        onlines: onlines.size,
        snipeFilter: ["discord.gg", "/invite/"]
    }
}