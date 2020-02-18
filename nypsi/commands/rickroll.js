/*jshint esversion: 8 */
const { getMember } = require("../utils.js");
const { list } = require("../optout.json");

var cooldown = new Set();

module.exports = {
    name: "rickroll",
    description: "rickroll your friends",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete();
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

        if (args.length == 0) {
            target = message.member;
        } else {
            if (!message.mentions.members.first()) {
                target = getMember(message, args[0]);
            } else {
                target = message.mentions.members.first();
            }
        }

        if (!target) {
            return message.channel.send("❌\ninvalid user");
        }

        if (list.includes(message.member.user.id)) {
            return message.channel.send("❌\nyou have opted out of bot dms, use $optin to be able to use this command");
        }

        if (list.includes(target.user.id)) {
            return message.channel.send("❌\nthis user has opted out of bot dms");
        }

        target.send("https://youtu.be/dQw4w9WgXcQ").then( () => {
            message.channel.send("✅\nsuccess");
        }).catch( () => {
            return message.channel.send("❌\ni cannot message that user");
        });

    }
};