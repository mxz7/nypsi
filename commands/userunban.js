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

        if (message.mentions.members.first()) {
            target = message.mentions.members.first().id;
        } else {
            target = args[0]
        }

        if (!banned.includes(target)) {
            return message.react("❌")
        }

        const index = banned.indexOf(target);

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