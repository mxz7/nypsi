const { list } = require("../optout.json");

const cooldown = new Set();

module.exports = {
    name: "optout",
    description: "optout of dms from the bot",
    category: "info",
    run: async (message, args) => {

        if (cooldown.has(message.member.id)) {
            message.delete().catch();
            return message.channel.send("❌ still on cooldown")
        }

        cooldown.add(message.member.id);

        setTimeout(() => {
            cooldown.delete(message.member.id);
        }, 30000);

        if (list.includes(message.member.user.id)) {
            return message.channel.send("❌ you are already opted out of bot dms - use $optin to opt in");
        }

        list.push(message.member.user.id);

        let value = {
            "list": list
        };

        const fs = require("fs");
        jsonData = JSON.stringify(value);

        fs.writeFileSync("./optout.json", jsonData, function(err) {
            if (err) console.log(err);
        });

        message.channel.send("✅ you will no longer recieve bot dms");
    }
};