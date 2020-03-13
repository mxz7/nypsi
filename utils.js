/*jshint esversion: 8 */
const fs = require("fs");
const users = JSON.parse(fs.readFileSync("./users.json"));
const multiplier = JSON.parse(fs.readFileSync("./slotsmulti.json"))
const isImageUrl = require('is-image-url');
const fetch = require("node-fetch")

setInterval(() => {
    const users1 = JSON.parse(fs.readFileSync("./users.json"))

    if (JSON.stringify(users) != JSON.stringify(users1)) {
        fs.writeFile("./users.json", JSON.stringify(users), (err) => {
            if (err) {
                console.log(err);
            }
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
    
            let timestamp = hours + ":" + minutes + ":" + seconds;
    
            console.log("\x1b[32m[" + timestamp + "] data saved..\x1b[37m")
        })
    }
    /**/
}, 30000)

module.exports = {

    redditImage: async function(post)  {

        let image = post.data.url 

        let final = false

        if (image.includes("imgur.com/a/")) {
            chosen = allowed[Math.floor(Math.random() * allowed.length)]
            image = chosen.data.url
        }

        if (image.includes("imgur") && !image.includes("gif")) {
            image = "https://i.imgur.com/" + image.split("/")[3]
            if (!isImageUrl(image)) {
                image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
            }
            final = true
        }

        if (image.includes("gfycat")) {

            const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())
            
            image = link.gfyItem.max5mbGif
            final = true
        }

        let count = 0

        while (!isImageUrl(image)) {
            if (lol) {
                break
            }

            if (count >= 10) {
                console.log("couldnt find porn @ " + subredditChoice)
                return message.channel.send("❌\nunable to find porn image")
            }

            count++

            chosen = allowed[Math.floor(Math.random() * allowed.length)]
            image = chosen.data.url

            if (image.includes("imgur.com/a/")) {
                chosen = allowed[Math.floor(Math.random() * allowed.length)]
                image = chosen.data.url
            }

            if (image.includes("imgur") && !image.includes("gif")) {
                image = "https://i.imgur.com/" + image.split("/")[3]
                if (!isImageUrl(image)) {
                    image = "https://i.imgur.com/" + image.split("/")[3] + ".gif"
                }
            }
    
            if (image.includes("gfycat")) {
    
                const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then(url => url.json())
    
                image = link.gfyItem.max5mbGif
            }
        }

        return image

    },

    getMember: function(message, memberName) {
        if (!message.guild) return null
        let target = message.guild.members.find(member => {
            if (member.user.tag.slice(0, -5).toLowerCase() == memberName.toLowerCase()) {
                return member;
            }
        });

        if (!target) {
            target = message.guild.members.find(member => {
                return member.displayName.toLowerCase().includes(memberName.toLowerCase()) || member.user.tag.toLowerCase().includes(memberName.toLowerCase());
            });
        }

        if (!target) {
            target = message.guild.members.find(member => {
                return member.user.id == memberName;
            });
        }

        return target;
    },
    
    formatDate: function(date) {
        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return new Intl.DateTimeFormat("en-US", options).format(date);
    },

    getMention: function(message, memberMention) {
        if (!memberMention) return;

        if (memberMention.startsWith("<@") && memberMention.endsWith(">")) {
            memberMention = memberMention.slice(2, -1);
            if (memberMention.startsWith('!')) {
                memberMention = memberMention.slice(1);
            }

            return message.guild.members.get(memberMention);
        }
    },

    getBalance: function(member) {
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

    topAmount: function(guild, amount) {
    
        let users1 = []

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

            if (getMemberID(guild, user)) {
                if (!users[user].balance == 0) {
                    usersFinal[count] = (count + 1) + " **" + getMemberID(guild, user).user.tag + "** $" + users[user].balance.toLocaleString()
                    count++
                }
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
};

function getMemberID(guild, id) {
    let target = guild.members.find(member => {
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

