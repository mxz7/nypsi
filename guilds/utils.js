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
            console.log("\x1b[32m[" + getTimestamp() + "] guilds saved..\x1b[37m")
        })

        timer = 0
        timerCheck = false
    } else if (!timerCheck) {
        timer++
    }

    if (timer >= 10 && !timerCheck) {
        guilds = JSON.parse(fs.readFileSync("./guilds/data.json"));
        console.log("\x1b[32m[" + getTimestamp() + "] data refreshed..\x1b[37m")
        timerCheck = true
        timer = 0
    }

}, 120000)

module.exports = {
    runCheck: function(guild) {
        const currentMembersPeak = guilds[guild.id].members
        const currentOnlinesPeak = guilds[guild.id].onlines

        const currentMembers = guild.members.cache.filter(member => !member.user.bot)
        const currentOnlines = currentMembers.filter(member => member.presence.status != "offline")

        if (currentMembers.size > currentMembersPeak) {
            guilds[guild.id] = {
                members: currentMembers.size,
                onlines: guilds[guild.id].onlines
            }
            console.log("[" + getTimestamp() + "] members peak updated for '" + guild.name + "' " + currentMembersPeak+ " -> " + currentMembers.size)
        }

        if (currentOnlines.size > currentOnlinesPeak) {
            guilds[guild.id] = {
                members: guilds[guild.id].members,
                onlines: currentOnlines.size
            }
            console.log("[" + getTimestamp() + "] online peak updated for '" + guild.name + "' " + currentOnlinesPeak + " -> " + currentOnlines.size)
        }
    },

    hasGuild: function(guild) {
        if (guilds[guild.id]) {
            return true
        } else {
            return false
        }
    },

    getPeaks: function(guild) {
        return guilds[guild.id]
    },

    createGuild: function(guild) {

        const members = guild.members.cache.filter(member => !member.user.bot)
        const onlines = members.filter(member => member.presence.status != "offline")

        guilds[guild.id] = {
            members: members.size,
            onlines: onlines.size
        }
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