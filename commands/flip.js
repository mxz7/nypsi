/*jshint esversion: 8 */

module.exports = {
    name: "flip",
    description: "flip a coin",
    category: "fun",
    run: async (message, args) => {
        const headTails = ["heads", "tails"];

        const answer = headTails[Math.floor(Math.random() * headTails.length)];

        message.channel.send("**" + answer + "!**");
    }
};