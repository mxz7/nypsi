const { userExists, updateBalance, getBalance, createUser } = require("../utils.js")

const cooldown = new Map();

module.exports = {
    name: "freemoney",
    description: "get $1k every 5 minutes",
    category: "money",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 300 - diff

            const minutes = Math.floor(time / 60)
            const seconds = time - minutes * 60

            let remaining

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`
            } else {
                remaining = `${seconds}s`
            }
            return message.channel.send("❌\nstill on cooldown for " + remaining );
        }

        cooldown.set(message.member.id, new Date());

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 300000);

        if (!userExists(message.member)) createUser(message.member)

        updateBalance(message.member, getBalance(message.member) + 1000)

        message.react("✅")
    }
}