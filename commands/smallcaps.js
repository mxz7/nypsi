const smallCaps = require('smallcaps');
const { Message } = require("discord.js")

module.exports = {
    name: "smallcaps",
    description: "change any text to small caps",
    category: "fun",
    /**
     * @param {Message} message 
     * @param {Array<String>} args 
     */
    run: async (message, args) => {

        if (args.length == 0) {
            return message.channel.send("❌ $smallcaps <text>");
        }

        const string = args.join(" ").toLowerCase()

        message.channel.send(smallCaps(string.toString()));

    }
};