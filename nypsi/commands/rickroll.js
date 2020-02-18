/*jshint esversion: 8 */
const { getMember } = require("../utils.js");

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

        target.send("https://youtu.be/dQw4w9WgXcQ").then( () => {
            message.channel.send("✅\nsuccess");
        }).catch( () => {
            return message.channel.send("❌\ni cannot message that user");
        });

    }
};