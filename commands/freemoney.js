const { userExists, updateBalance, getBalance, createUser } = require("../utils.js")

var cooldown = new Set();

module.exports = {
    name: "freemoney",
    description: "get $1k every hour",
    category: "money",
    run: async (message, args) => {
        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 3600000);

        if (!userExists(message.member)) createUser(message.member)

        updateBalance(message.member, getBalance(message.member) + 1000)

        message.react("✅")
    }
}