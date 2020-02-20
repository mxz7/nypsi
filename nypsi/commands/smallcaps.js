/*jshint esversion: 8 */
const smallCaps = require('smallcaps');

module.exports = {
    name: "smallcaps",
    description: "change any text to small caps",
    run: async (message, args) => {

        if (args.length == 0) {
            return message.channel.send("❌\n$smallcaps <text>");
        }

        let lols = "";

        for (let word of args) {
            lols = lols + " " + word;
        }

        message.channel.send(smallCaps(lols.toString()));

    }
};