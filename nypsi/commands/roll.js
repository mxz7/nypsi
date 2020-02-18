/*jshint esversion: 8 */

module.exports = {
    name: "roll",
    description: "roll a dice",
    run: async (message, args) => {

        message.channel.send("🎲\n**you rolled a " + Math.ceil(Math.random() * 6) + "**");

    }
};