/*jshint esversion: 8 */
const { banned } = require("../banned.json");

module.exports = {
    name: "userban",
    description: "ban a user from the bot",
    category: "none",
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

        if (banned.includes(target.id)) {
            return message.channel.send("❌\nthis user is already banned");
        }

        banned.push(target.id);

        let value = {
            "banned": banned
        };

        const fs = require("fs");
        jsonData = JSON.stringify(value);

        fs.writeFileSync("./banned.json", jsonData, function(err) {
            if (err) console.log(err);
        });

        message.channel.send("✅\nuser banned");

    }
};