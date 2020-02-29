const { getBalance, createUser } = require("../utils.js")

module.exports = {
    name: "slots",
    description: "play slots",
    category: "money",
    run: async (message, args) => {

        if (!getBalance(message.member)) {
            createUser(message.member)
        }



    }
}