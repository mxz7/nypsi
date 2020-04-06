/*jshint esversion: 8 */
const { banned } = require("../banned.json");

module.exports = {
    name: "userunban",
    description: "unban a user from the bot",
    category: "none",
    run: async (message, args) => {
        if (message.member.user.id != "672793821850894347") {
            return
        }

        if (args.length == 0) {
            return message.react("❌")
        }

        let target;

        target = message.mentions.members.first();

        if (!target) {
            return message.react("❌")
        }

        if (!banned.includes(target.user.id)) {
            return message.react("❌")
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

        message.react("✅")
    }
};