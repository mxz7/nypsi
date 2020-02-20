/*jshint esversion: 8 */
const { list } = require("../optout.json");
const { banned } = require("../banned.json");

var cooldown = new Set();

module.exports = {
    name: "rickroll",
    description: "rickroll your friends",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌\nstill on cooldown").then(m => m.delete(1000));
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 10000);

        if (args.length == 0) {
            return message.channel.send("❌\ninvalid user");
        }

        let target;

        target = message.mentions.members.first();

        if (!target) {
            return message.channel.send("❌\ninvalid user - you must tag the user for this command");
        }

        if (list.includes(message.member.user.id)) {
            return message.channel.send("❌\nyou have opted out of bot dms, use $optin to be able to use this command");
        }

        if (list.includes(target.user.id)) {
            return message.channel.send("❌\nthis user has opted out of bot dms");
        }

        if (banned.includes(target.user.id)) {
            return message.channel.send("❌\nthis user is banned from the bot");
        }

        target.send("**sent by " + message.member.user.tag + " in " + message.guild.name + "** use $optout to optout" + " https://youtu.be/dQw4w9WgXcQ").then( () => {
            message.channel.send("✅\nsuccess");
        }).catch( () => {
            return message.channel.send("❌\ni cannot message that user");
        });

    }
};