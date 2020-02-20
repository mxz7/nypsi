/*jshint esversion: 8 */
const { banned } = require("../banned.json");

module.exports = {
    name: "userunban",
    description: "unban a user from the bot",
    run: async (message, args) => {
        if (message.member.user.id != "672793821850894347") {
            return message.channel.send("❌\nyou do not have permission");
        }

        if (args.length == 0) {
            return message.channel.send("❌\ninvalid user - you must tag the user for this command");
        }

        let target;

        target = message.mentions.members.first();

        if (!target) {
            return message.channel.send("❌\ninvalid user - you must tag the user for this command");
        }

        if (!banned.includes(target.user.id)) {
            return message.channel.send("❌\nthis user isnt banned");
        }

        const index = banned.indexOf(target.user.id);

        if (index > -1) {
            banned.splice(index, 1);
        }

        let value = {
            "banned": banned
        };

        const fs = require("fs");
        jsonData = JSON.stringify(value);

        fs.writeFileSync("./banned.json", jsonData, function(err) {
            if (err) console.log(err);
        });

        message.channel.send("✅\nuser has been unbanned");
    }
};