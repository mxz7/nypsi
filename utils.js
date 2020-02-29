/*jshint esversion: 8 */
const { wholesome } = require("./images.json");
const fs = require("fs");
const balance = JSON.parse(fs.readFileSync("./users.json"));
const multiplier = JSON.parse(fs.readFileSync("./slotsmulti.json"))

module.exports = {
    getMember: function(message, memberName) {
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

    wholesomeImg: function() {
        return wholesome[Math.floor(Math.random() * wholesome.length)];
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
        return balance[member.user.id].balance
    },

    getMultiplier: function(item) {
        return multiplier[item]
    },

    userExists: function(member) {
        if (balance[member.user.id]) {
            return true
        } else {
            return false
        }
    },

    updateBalance: function(member, amount) {
        balance[member.user.id] = {
            balance: amount
        }

        fs.writeFile("./users.json", JSON.stringify(balance), (err) => {
            if (err) {
                console.log(err)
            }
        })
    },

    topAmount: function(guild, amount) {
    
        let users = []

        for (user in balance) {
            users.push(user)
        }

        users.sort(function(a, b) {
            return balance[b].balance - balance[a].balance;
        })

        let usersFinal = []

        let count = 0

        for (user of users) {
            if (count >= amount) break

            if (getMemberID(guild, user)) {
                usersFinal[count] = count + " **" + getMemberID(guild, user).user.tag + "** $" + balance[user].balance
                count++
            }
        }
        return usersFinal
    },

    createUser: function(member) {
        balance[member.user.id] = {
            balance: 100
        }

        fs.writeFile("./users.json", JSON.stringify(balance), (err) => {
            if (err) {
                console.log(err)
            }
        })
    }
};

function getMemberID(guild, id) {
    let target = guild.members.find(member => {
        return member.user.id == id
    })

    return target
}
