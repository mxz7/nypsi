const { createUser, getBalance, userExists } = require("../utils.js")

var cooldown = new Set()

module.exports = {
    name: "broke",
    description: "reset money back to 100",
    category: "money",
    run: async (message, args) => {

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (getBalance(message.member) > 0) {
            return message.channel.send("❌\nyou have more than $0")
        }

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 3600000);

        createUser(message.member)

        message.react("✅")

    }
}