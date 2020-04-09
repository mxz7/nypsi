const { createUser, getBalance, userExists } = require("../economy/utils.js")

const cooldown = new Map()

module.exports = {
    name: "broke",
    description: "reset money back to 100 if you have $0",
    category: "money",
    run: async (message, args) => {

        if (!userExists(message.member)) {
            createUser(message.member)
        }

        if (getBalance(message.member) > 0) {
            return message.channel.send("❌\nyou have more than $0")
        }

        if (cooldown.has(message.member.id)) {
            const init = cooldown.get(message.member.id)
            const curr = new Date()
            const diff = Math.round((curr - init) / 1000)
            const time = 20 - diff

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
        }, 20000);

        createUser(message.member)

        message.react("✅")

    }
}